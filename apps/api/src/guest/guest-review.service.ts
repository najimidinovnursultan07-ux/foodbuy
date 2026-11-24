import { Injectable } from '@nestjs/common';
import { Prisma } from '@qrmenu/db';
import { REVIEW_WINDOW_HOURS, type ReviewRequest, type ReviewResponse, type ReviewStatusDto } from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { PublicMenuService } from '../public-menu/public-menu.service';
import { NotificationsService } from '../notifications/notifications.service';
import { guestError } from '../common/guest-error';

/**
 * Умный отзыв после закрытия счёта: 4–5★ — гостю ссылка на 2GIS ресторана,
 * 1–3★ — только владельцу (в Telegram и в отчётах панели), публично никуда не уходит.
 */
@Injectable()
export class GuestReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: PublicMenuService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Счёт этого стола, закрытый недавно, с суммой и без отзыва. */
  private async reviewableBill(slug: string, token: string, billId: string) {
    const table = await this.menu.resolveTable(slug, token);
    const bill = await this.prisma.tableBill.findFirst({
      where: {
        id: billId,
        restaurantId: table.restaurantId,
        tableId: table.id,
        status: 'CLOSED',
        totalTyiyn: { gt: 0 },
        closedAt: { gte: new Date(Date.now() - REVIEW_WINDOW_HOURS * 3600_000) },
      },
      include: { review: { select: { id: true } } },
    });
    return { table, bill: bill && !bill.review ? bill : null };
  }

  async status(slug: string, token: string, billId: string): Promise<ReviewStatusDto> {
    const { bill } = await this.reviewableBill(slug, token, billId);
    return { canReview: Boolean(bill) };
  }

  async create(slug: string, token: string, req: ReviewRequest): Promise<ReviewResponse> {
    const { table, bill } = await this.reviewableBill(slug, token, req.billId);
    if (!bill) throw guestError(409, 'REVIEW_NOT_ALLOWED');
    const r = table.restaurant;
    const positive = req.rating >= 4;
    const comment = req.comment?.trim() || null;
    try {
      await this.prisma.review.create({
        data: { restaurantId: r.id, billId: bill.id, rating: req.rating, comment, sentTo2gis: positive && Boolean(r.twoGisUrl) },
      });
    } catch (e) {
      // Два телефона за столом отправили одновременно — второй отзыв не нужен
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw guestError(409, 'REVIEW_NOT_ALLOWED');
      throw e;
    }
    if (!positive) await this.notifications.notifyBadReview(r.id, req.rating, table.label, comment);
    return { twoGisUrl: positive ? r.twoGisUrl : null };
  }
}
