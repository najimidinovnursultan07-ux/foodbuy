import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { TableUpdatedEvent } from '@qrmenu/shared';
import { PublicMenuService } from '../public-menu/public-menu.service';

export const tableRoom = (tableId: string) => `table:${tableId}`;
export const staffRoom = (restaurantId: string) => `staff:${restaurantId}`;

/**
 * Комнаты:
 *  - table:{tableId}  — гости стола (вход по подписанному токену QR)
 *  - staff:{restaurantId} — персонал ресторана (вход с авторизацией — шаг 4)
 */
@WebSocketGateway()
export class RealtimeGateway {
  @WebSocketServer() server: Server;

  constructor(private readonly menu: PublicMenuService) {}

  @SubscribeMessage('guest:join')
  async guestJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { slug?: unknown; token?: unknown }) {
    if (typeof body?.slug !== 'string' || typeof body?.token !== 'string') return { ok: false };
    try {
      const table = await this.menu.resolveTable(body.slug, body.token);
      for (const room of socket.rooms) if (room.startsWith('table:')) await socket.leave(room);
      await socket.join(tableRoom(table.id));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /** Гостям стола: «что-то изменилось — перечитайте счёт». */
  toTable(tableId: string, event: TableUpdatedEvent): void {
    this.server?.to(tableRoom(tableId)).emit('table.updated', event);
  }

  /** Персоналу ресторана. */
  toStaff(restaurantId: string, event: string, payload: Record<string, unknown>): void {
    this.server?.to(staffRoom(restaurantId)).emit(event, payload);
  }
}
