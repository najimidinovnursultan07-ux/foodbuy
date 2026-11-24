import type { Prisma } from '@qrmenu/db';
import { aggregateOrderStatus } from '@qrmenu/shared';

/**
 * Пересчитать статус заказа по позициям и проставить отметки времени.
 * Заказ, ждущий подтверждения официанта, не трогаем.
 */
export async function recomputeOrderStatus(tx: Prisma.TransactionClient, restaurantId: string, orderId: string) {
  const order = await tx.order.findFirstOrThrow({
    where: { id: orderId, restaurantId },
    include: { items: { select: { status: true } } },
  });
  if (order.status === 'PENDING_CONFIRMATION') return order;

  const status = aggregateOrderStatus(order.items);
  const now = new Date();
  const started = status === 'IN_PROGRESS' || status === 'READY' || status === 'SERVED';
  return tx.order.update({
    where: { id: order.id },
    data: {
      status,
      startedAt: started ? (order.startedAt ?? now) : status === 'NEW' ? null : order.startedAt,
      readyAt: status === 'READY' || status === 'SERVED' ? (order.readyAt ?? now) : null,
      servedAt: status === 'SERVED' ? (order.servedAt ?? now) : null,
      cancelledAt: status === 'CANCELLED' ? (order.cancelledAt ?? now) : order.cancelledAt,
    },
  });
}
