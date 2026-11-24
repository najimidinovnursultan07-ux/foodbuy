import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import type { DishInput, ModifierGroupsInput, SettingsInput, StaffInput } from '@qrmenu/shared';
import { CurrentStaff, Roles, StaffAuthGuard } from '../staff/staff-auth.guard';
import type { AuthedStaff } from '../staff/staff-auth.service';
import { staffError } from '../common/api-error';
import { MAX_UPLOAD_BYTES } from '../storage/images';
import { AdminMenuService } from './admin-menu.service';
import { AdminTablesService } from './admin-tables.service';
import { AdminStaffService } from './admin-staff.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminReportsService } from './admin-reports.service';
import { TelegramClient } from '../notifications/telegram.client';
import { TelegramBotService } from '../notifications/telegram-bot.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.module';
import {
  dateRange,
  dishSchema,
  id,
  localized,
  modifierGroupsSchema,
  parse,
  settingsSchema,
  staffSchema,
} from './schemas';

const upload = FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
type File = { buffer: Buffer } | undefined;
const fileBuf = (f: File) => {
  if (!f?.buffer?.length) throw staffError(400, 'INVALID_IMAGE');
  return f.buffer;
};

/** Панель ресторана: только менеджер, только свой ресторан. */
@Controller('admin')
@UseGuards(StaffAuthGuard)
@Roles('manager')
export class AdminController {
  constructor(
    private readonly menu: AdminMenuService,
    private readonly tables: AdminTablesService,
    private readonly staff: AdminStaffService,
    private readonly settings: AdminSettingsService,
    private readonly reports: AdminReportsService,
    private readonly telegram: TelegramClient,
    private readonly bot: TelegramBotService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  // ───────── Меню ─────────

  @Get('menu')
  getMenu(@CurrentStaff() me: AuthedStaff) {
    return this.menu.getMenu(me.restaurantId);
  }

  @Post('categories')
  createCategory(@CurrentStaff() me: AuthedStaff, @Body() body: unknown) {
    return this.menu.createCategory(me.restaurantId, parse(z.object({ name: localized() }), body).name);
  }

  @Patch('categories/:id')
  updateCategory(@CurrentStaff() me: AuthedStaff, @Param('id') cid: string, @Body() body: unknown) {
    return this.menu.updateCategory(me.restaurantId, cid, parse(z.object({ name: localized().optional(), isActive: z.boolean().optional() }), body));
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentStaff() me: AuthedStaff, @Param('id') cid: string) {
    return this.menu.deleteCategory(me.restaurantId, cid);
  }

  @Post('categories/reorder')
  reorderCategories(@CurrentStaff() me: AuthedStaff, @Body() body: unknown) {
    return this.menu.reorderCategories(me.restaurantId, parse(z.object({ ids: z.array(id).min(1).max(200) }), body).ids);
  }

  @Post('dishes')
  createDish(@CurrentStaff() me: AuthedStaff, @Body() body: unknown) {
    return this.menu.createDish(me.restaurantId, parse<DishInput>(dishSchema, body));
  }

  @Patch('dishes/:id')
  updateDish(@CurrentStaff() me: AuthedStaff, @Param('id') did: string, @Body() body: unknown) {
    return this.menu.updateDish(me.restaurantId, did, parse<Partial<DishInput>>(dishSchema.partial(), body));
  }

  @Delete('dishes/:id')
  deleteDish(@CurrentStaff() me: AuthedStaff, @Param('id') did: string) {
    return this.menu.deleteDish(me.restaurantId, did);
  }

  @Post('dishes/reorder')
  reorderDishes(@CurrentStaff() me: AuthedStaff, @Body() body: unknown) {
    const b = parse(z.object({ categoryId: id, ids: z.array(id).min(1).max(500) }), body);
    return this.menu.reorderDishes(me.restaurantId, b.categoryId, b.ids);
  }

  @Put('dishes/:id/modifiers')
  setModifiers(@CurrentStaff() me: AuthedStaff, @Param('id') did: string, @Body() body: unknown) {
    return this.menu.setModifiers(me.restaurantId, did, parse<ModifierGroupsInput>(modifierGroupsSchema, body));
  }

  @Put('dishes/:id/upsells')
  setUpsells(@CurrentStaff() me: AuthedStaff, @Param('id') did: string, @Body() body: unknown) {
    return this.menu.setUpsells(me.restaurantId, did, parse(z.object({ dishIds: z.array(id).max(20) }), body).dishIds);
  }

  @Post('dishes/:id/photo')
  @UseInterceptors(upload)
  uploadPhoto(@CurrentStaff() me: AuthedStaff, @Param('id') did: string, @UploadedFile() file: File) {
    return this.menu.uploadPhoto(me.restaurantId, did, fileBuf(file));
  }

  @Delete('dishes/:id/photo')
  deletePhoto(@CurrentStaff() me: AuthedStaff, @Param('id') did: string) {
    return this.menu.deletePhoto(me.restaurantId, did);
  }

  @Patch('modifiers/:id')
  modifierAvailability(@CurrentStaff() me: AuthedStaff, @Param('id') mid: string, @Body() body: unknown) {
    return this.menu.setModifierAvailability(me.restaurantId, mid, parse(z.object({ isAvailable: z.boolean() }), body).isAvailable);
  }

  // ───────── Столы и QR ─────────

  @Get('tables')
  listTables(@CurrentStaff() me: AuthedStaff) {
    return this.tables.list(me.restaurantId);
  }

  @Post('tables')
  createTables(@CurrentStaff() me: AuthedStaff, @Body() body: unknown) {
    return this.tables.create(me.restaurantId, parse(z.object({ labels: z.array(z.string().trim().min(1).max(20)).min(1).max(100) }), body).labels);
  }

  @Patch('tables/:id')
  updateTable(@CurrentStaff() me: AuthedStaff, @Param('id') tid: string, @Body() body: unknown) {
    return this.tables.update(me.restaurantId, tid, parse(z.object({ label: z.string().trim().min(1).max(20).optional(), isActive: z.boolean().optional() }), body));
  }

  @Post('tables/:id/reissue')
  reissue(@CurrentStaff() me: AuthedStaff, @Param('id') tid: string) {
    return this.tables.reissue(me.restaurantId, tid);
  }

  @Get('tables/qr.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="qr-tables.pdf"')
  async qrPdf(@CurrentStaff() me: AuthedStaff, @Query('ids') ids?: string) {
    const list = ids ? parse(z.array(id).max(200), ids.split(',')) : undefined;
    return new StreamableFile(await this.tables.pdf(me.restaurantId, list));
  }

  // ───────── Сотрудники ─────────

  @Get('staff')
  listStaff(@CurrentStaff() me: AuthedStaff) {
    return this.staff.list(me.restaurantId);
  }

  @Post('staff')
  createStaff(@CurrentStaff() me: AuthedStaff, @Body() body: unknown) {
    return this.staff.create(me.restaurantId, parse<StaffInput>(staffSchema, body));
  }

  @Put('staff/:id')
  updateStaff(@CurrentStaff() me: AuthedStaff, @Param('id') sid: string, @Body() body: unknown) {
    return this.staff.update(me.restaurantId, me, sid, parse<StaffInput>(staffSchema, body));
  }

  // ───────── Настройки ─────────

  @Get('settings')
  getSettings(@CurrentStaff() me: AuthedStaff) {
    return this.settings.get(me.restaurantId);
  }

  @Put('settings')
  updateSettings(@CurrentStaff() me: AuthedStaff, @Body() body: unknown) {
    return this.settings.update(me.restaurantId, parse<SettingsInput>(settingsSchema, body));
  }

  @Post('settings/logo')
  @UseInterceptors(upload)
  uploadLogo(@CurrentStaff() me: AuthedStaff, @UploadedFile() file: File) {
    return this.settings.uploadLogo(me.restaurantId, fileBuf(file));
  }

  @Delete('settings/logo')
  deleteLogo(@CurrentStaff() me: AuthedStaff) {
    return this.settings.deleteLogo(me.restaurantId);
  }

  // ───────── Telegram владельца ─────────

  @Get('telegram')
  async telegramStatus(@CurrentStaff() me: AuthedStaff) {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: me.restaurantId } });
    return { available: this.telegram.enabled, connected: Boolean(r.telegramChatId), reportHour: r.reportHour };
  }

  @Post('telegram/link')
  telegramLink(@CurrentStaff() me: AuthedStaff) {
    if (!this.telegram.enabled) throw staffError(409, 'INVALID_STATE');
    return this.bot.createLink(me.restaurantId);
  }

  @Post('telegram/test')
  async telegramTest(@CurrentStaff() me: AuthedStaff) {
    const sent = await this.notifications.notifyOwner(me.restaurantId, (m, r) => m.test(r.name));
    if (!sent) throw staffError(409, 'INVALID_STATE');
    return { ok: true };
  }

  @Delete('telegram')
  async telegramUnlink(@CurrentStaff() me: AuthedStaff) {
    await this.prisma.restaurant.update({ where: { id: me.restaurantId }, data: { telegramChatId: null } });
    return { ok: true };
  }

  // ───────── Отчёты ─────────

  @Get('reports')
  report(@CurrentStaff() me: AuthedStaff, @Query() query: unknown) {
    const r = parse(dateRange, query);
    return this.reports.report(me.restaurantId, r.from, r.to);
  }
}
