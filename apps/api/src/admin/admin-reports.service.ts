import { Injectable } from '@nestjs/common';
import { MAX_REPORT_DAYS, type LocalizedText, type ReportDto } from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { staffError } from '../common/api-error';

const DAY = 86_400_000;
/** Начало дня по Бишкеку (UTC+6, без перехода на летнее время). */
const bishkekMidnight = (date: string) => new Date(`${date}T00:00:00+06:00`);
const isoDate = (d: Date) => new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 10);

/**
 * Отчёты считаются по закрытым счетам (деньги получены официантом).
 * Период — календарные дни по Бишкеку, включительно.
 */
@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(restaurantId: string, from: string, to: string): Promise<ReportDto> {
    const start = bishkekMidnight(from);
    const end = new Date(bishkekMidnight(to).getTime() + DAY);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw staffError(400, 'INVALID_REQUEST');
    const days = Math.round((end.getTime() - start.getTime()) / DAY);
    if (days < 1 || days > MAX_REPORT_DAYS) throw staffError(400, 'INVALID_REQUEST');

    // Счета с нулевой суммой (всё отменено) в отчёт не попадают
    const where = { restaurantId, status: 'CLOSED' as const, closedAt: { gte: start, lt: end }, totalTyiyn: { gt: 0 } };

    const reviewWhere = { restaurantId, createdAt: { gte: start, lt: end } };
    const [reviewAgg, lowCount, recentReviews] = await Promise.all([
      this.prisma.review.aggregate({ where: reviewWhere, _count: true, _avg: { rating: true } }),
      this.prisma.review.count({ where: { ...reviewWhere, rating: { lte: 3 } } }),
      this.prisma.review.findMany({
        where: reviewWhere,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { bill: { select: { table: { select: { label: true } } } } },
      }),
    ]);

    const [totals, byPayment, ordersCount, byDayRows, topRows] = await Promise.all([
      this.prisma.tableBill.aggregate({ where, _sum: { totalTyiyn: true, serviceFeeTyiyn: true }, _count: true }),
      this.prisma.tableBill.groupBy({ by: ['paidWith'], where, _sum: { totalTyiyn: true } }),
      this.prisma.order.count({ where: { restaurantId, status: { not: 'CANCELLED' }, bill: where } }),
      this.prisma.$queryRaw<{ d: string; revenue: number; bills: number }[]>`
        SELECT to_char(("closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bishkek')::date, 'YYYY-MM-DD') AS d,
               SUM("totalTyiyn")::int AS revenue, COUNT(*)::int AS bills
        FROM "TableBill"
        WHERE "restaurantId" = ${restaurantId} AND "status" = 'CLOSED' AND "totalTyiyn" > 0
          AND "closedAt" >= ${start} AND "closedAt" < ${end}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ name: LocalizedText; quantity: number; revenue: number }[]>`
        SELECT (ARRAY_AGG(i."nameSnapshot" ORDER BY o."createdAt" DESC))[1] AS name,
               SUM(i."quantity")::int AS quantity,
               SUM(i."quantity" * i."unitPriceTyiyn")::int AS revenue
        FROM "OrderItem" i
        JOIN "Order" o ON o."id" = i."orderId"
        JOIN "TableBill" b ON b."id" = o."billId"
        WHERE b."restaurantId" = ${restaurantId} AND i."restaurantId" = ${restaurantId}
          AND b."status" = 'CLOSED' AND b."closedAt" >= ${start} AND b."closedAt" < ${end}
          AND o."status" <> 'CANCELLED' AND i."status" <> 'CANCELLED'
        GROUP BY COALESCE(i."dishId", i."nameSnapshot"->>'ru')
        ORDER BY quantity DESC, revenue DESC
        LIMIT 10`,
    ]);

    const revenue = totals._sum.totalTyiyn ?? 0;
    const bills = totals._count;
    const byDayMap = new Map(byDayRows.map((r) => [r.d, r]));
    const byDay: ReportDto['byDay'] = [];
    for (let t = start.getTime(); t < end.getTime(); t += DAY) {
      const d = isoDate(new Date(t));
      const row = byDayMap.get(d);
      byDay.push({ date: d, revenueTyiyn: row?.revenue ?? 0, billsCount: row?.bills ?? 0 });
    }
    const sumBy = (m: 'CASH' | 'CARD') => byPayment.find((p) => p.paidWith === m)?._sum.totalTyiyn ?? 0;

    return {
      from,
      to,
      revenueTyiyn: revenue,
      serviceFeeTyiyn: totals._sum.serviceFeeTyiyn ?? 0,
      billsCount: bills,
      avgCheckTyiyn: bills ? Math.round(revenue / bills) : 0,
      ordersCount,
      cashTyiyn: sumBy('CASH'),
      cardTyiyn: sumBy('CARD'),
      byDay,
      topDishes: topRows.map((r) => ({ name: r.name, quantity: r.quantity, revenueTyiyn: r.revenue })),
      reviews: {
        count: reviewAgg._count,
        avgRating: reviewAgg._avg.rating === null ? null : Math.round(reviewAgg._avg.rating * 10) / 10,
        lowCount,
        recent: recentReviews.map((rv) => ({
          rating: rv.rating,
          comment: rv.comment,
          createdAt: rv.createdAt.toISOString(),
          tableLabel: rv.bill.table.label,
        })),
      },
    };
  }
}
