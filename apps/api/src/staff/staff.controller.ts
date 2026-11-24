import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CloseBillRequest, StaffLoginRequest } from '@qrmenu/shared';
import { staffError } from '../common/api-error';
import { StaffAuthService, toProfile, type AuthedStaff } from './staff-auth.service';
import { CurrentStaff, Roles, StaffAuthGuard } from './staff-auth.guard';
import { KitchenService } from './kitchen.service';
import { WaiterService } from './waiter.service';

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw staffError(400, 'INVALID_REQUEST');
  return r.data;
}

const loginSchema = z.object({
  phone: z.string().min(5).max(32),
  pin: z.string().regex(/^\d{4,6}$/),
  restaurantSlug: z.string().max(64).optional(),
});
const closeSchema = z.object({ paidWith: z.enum(['CASH', 'CARD']) });
const ticketAction = z.enum(['start', 'ready', 'back']);
const station = z.enum(['KITCHEN', 'BAR']);

@Controller('staff')
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.auth.login(parse<StaffLoginRequest>(loginSchema, body));
  }

  @Get('me')
  @UseGuards(StaffAuthGuard)
  me(@CurrentStaff() staff: AuthedStaff) {
    return toProfile(staff);
  }
}

/** Экран кухни/бара. */
@Controller('staff/kitchen')
@UseGuards(StaffAuthGuard)
@Roles('kitchen', 'manager')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get()
  board(@CurrentStaff() staff: AuthedStaff, @Query('station') st?: string) {
    return this.kitchen.board(staff, st === undefined ? undefined : parse(station, st));
  }

  @Post('tickets/:orderId/:station/:action')
  @HttpCode(200)
  action(
    @CurrentStaff() staff: AuthedStaff,
    @Param('orderId') orderId: string,
    @Param('station') st: string,
    @Param('action') action: string,
  ) {
    return this.kitchen.ticketAction(staff, orderId, parse(station, st), parse(ticketAction, action));
  }
}

/** Лента официанта. */
@Controller('staff')
@UseGuards(StaffAuthGuard)
@Roles('waiter', 'manager')
export class WaiterController {
  constructor(private readonly waiter: WaiterService) {}

  @Get('waiter/feed')
  feed(@CurrentStaff() staff: AuthedStaff) {
    return this.waiter.feed(staff);
  }

  @Post('calls/:id/:action')
  @HttpCode(200)
  call(@CurrentStaff() staff: AuthedStaff, @Param('id') id: string, @Param('action') action: string) {
    return this.waiter.callAction(staff, id, parse(z.enum(['ack', 'done']), action));
  }

  @Post('orders/:id/confirm')
  @HttpCode(200)
  confirm(@CurrentStaff() staff: AuthedStaff, @Param('id') id: string) {
    return this.waiter.confirm(staff, id);
  }

  @Post('orders/:id/reject')
  @HttpCode(200)
  reject(@CurrentStaff() staff: AuthedStaff, @Param('id') id: string) {
    return this.waiter.reject(staff, id);
  }

  @Post('orders/:id/served')
  @HttpCode(200)
  served(@CurrentStaff() staff: AuthedStaff, @Param('id') id: string) {
    return this.waiter.served(staff, id);
  }

  @Post('bills/:id/close')
  @HttpCode(200)
  close(@CurrentStaff() staff: AuthedStaff, @Param('id') id: string, @Body() body: unknown) {
    return this.waiter.closeBill(staff, id, parse<CloseBillRequest>(closeSchema, body));
  }
}
