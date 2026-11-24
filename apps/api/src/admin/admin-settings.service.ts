import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@qrmenu/db';
import type { OpeningHours, SettingsDto, SettingsInput } from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.service';
import { processLogo } from '../storage/images';

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(restaurantId: string): Promise<SettingsDto> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: { venues: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    return {
      name: r.name,
      slug: r.slug,
      logoUrl: r.logoUrl,
      accentColor: r.accentColor,
      defaultLocale: r.defaultLocale as SettingsDto['defaultLocale'],
      serviceFeeBp: r.serviceFeeBp,
      orderFlow: r.orderFlow,
      orderAlertMinutes: r.orderAlertMinutes,
      twoGisUrl: r.twoGisUrl,
      reportHour: r.reportHour,
      openingHours: (r.venues[0]?.openingHours ?? {}) as OpeningHours,
    };
  }

  async update(restaurantId: string, input: SettingsInput): Promise<SettingsDto> {
    const { openingHours, ...rest } = input;
    await this.prisma.$transaction([
      this.prisma.restaurant.update({ where: { id: restaurantId }, data: rest }),
      // Часы — общие для всех залов ресторана (в MVP зал один)
      this.prisma.venue.updateMany({ where: { restaurantId }, data: { openingHours: openingHours as Prisma.InputJsonValue } }),
    ]);
    return this.get(restaurantId);
  }

  async uploadLogo(restaurantId: string, file: Buffer) {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const logoUrl = await this.storage.put(`r/${restaurantId}/logo-${randomBytes(6).toString('hex')}.webp`, await processLogo(file), 'image/webp');
    await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { logoUrl } });
    await this.storage.remove(r.logoUrl);
    return { logoUrl };
  }

  async deleteLogo(restaurantId: string) {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { logoUrl: null } });
    await this.storage.remove(r.logoUrl);
    return { ok: true };
  }
}
