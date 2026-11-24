import { Injectable } from '@nestjs/common';
import type { AdminTableDto } from '@qrmenu/shared';
import { createTableToken } from '@qrmenu/shared/server';
import { PrismaService } from '../prisma/prisma.module';
import { requireEnv } from '../config/env';
import { staffError } from '../common/api-error';
import { renderQrPdf } from './qr-pdf';

const WEB_URL = () => (process.env.PUBLIC_WEB_URL ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000').replace(/\/$/, '');

@Injectable()
export class AdminTablesService {
  private readonly secret = requireEnv('QR_SIGNING_SECRET');

  constructor(private readonly prisma: PrismaService) {}

  private url(slug: string, t: { id: string; tokenVersion: number }) {
    return `${WEB_URL()}/m/${slug}/${createTableToken(t.id, t.tokenVersion, this.secret)}`;
  }

  async list(restaurantId: string): Promise<AdminTableDto[]> {
    const [r, tables] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { slug: true } }),
      this.prisma.table.findMany({
        where: { restaurantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { bills: { where: { status: 'OPEN' } } } } },
      }),
    ]);
    return tables.map((t) => ({
      id: t.id,
      label: t.label,
      isActive: t.isActive,
      tokenVersion: t.tokenVersion,
      url: this.url(r.slug, t),
      hasOpenBill: t._count.bills > 0,
    }));
  }

  /** Добавить столы (по одному или пачкой «1…10»). */
  async create(restaurantId: string, labels: string[]) {
    const venue =
      (await this.prisma.venue.findFirst({ where: { restaurantId }, orderBy: { createdAt: 'asc' } })) ??
      (await this.prisma.venue.create({ data: { restaurantId, name: 'Зал' } }));
    const clean = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
    const taken = await this.prisma.table.findMany({ where: { venueId: venue.id, label: { in: clean } }, select: { label: true } });
    if (taken.length) throw staffError(409, 'LABEL_TAKEN', { labels: taken.map((t) => t.label) });
    const last = await this.prisma.table.aggregate({ where: { restaurantId }, _max: { sortOrder: true } });
    const start = (last._max.sortOrder ?? -1) + 1;
    await this.prisma.table.createMany({
      data: clean.map((label, i) => ({ restaurantId, venueId: venue.id, label, sortOrder: start + i })),
    });
    return { created: clean.length };
  }

  async update(restaurantId: string, id: string, data: { label?: string; isActive?: boolean }) {
    const table = await this.prisma.table.findFirst({ where: { id, restaurantId } });
    if (!table) throw staffError(404, 'NOT_FOUND');
    if (data.label && data.label !== table.label) {
      const clash = await this.prisma.table.count({ where: { venueId: table.venueId, label: data.label } });
      if (clash) throw staffError(409, 'LABEL_TAKEN', { labels: [data.label] });
    }
    await this.prisma.table.update({ where: { id }, data });
    return { id };
  }

  /** Перевыпуск QR: старая наклейка перестаёт открывать меню. */
  async reissue(restaurantId: string, id: string) {
    const { count } = await this.prisma.table.updateMany({ where: { id, restaurantId }, data: { tokenVersion: { increment: 1 } } });
    if (!count) throw staffError(404, 'NOT_FOUND');
    return { id };
  }

  async pdf(restaurantId: string, ids?: string[]): Promise<Buffer> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { slug: true, name: true } });
    const tables = await this.prisma.table.findMany({
      where: { restaurantId, isActive: true, ...(ids?.length ? { id: { in: ids } } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!tables.length) throw staffError(404, 'NOT_FOUND');
    return renderQrPdf(
      r.name,
      tables.map((t) => ({ label: t.label, url: this.url(r.slug, t) })),
    );
  }
}
