import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  ORDER_LIMITS,
  type CreateCallRequest,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type GuestBillDto,
  type ReviewRequest,
} from '@qrmenu/shared';
import { guestError } from '../common/guest-error';
import { GuestOrdersService } from './guest-orders.service';
import { GuestBillService } from './guest-bill.service';
import { GuestReviewService } from './guest-review.service';

const id = z.string().min(1).max(64);

const createOrderSchema = z.object({
  deviceId: z.string().min(8).max(64),
  clientRequestId: z.string().min(8).max(64),
  items: z
    .array(
      z.object({
        dishId: id,
        selection: z.record(id, z.array(id).max(20)).default({}),
        comment: z.string().max(ORDER_LIMITS.maxCommentLength).optional(),
        quantity: z.number().int().min(1).max(ORDER_LIMITS.maxQuantity),
      }),
    )
    .min(1)
    .max(ORDER_LIMITS.maxLines),
});

const reviewSchema = z.object({
  billId: id,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

const createCallSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CALL_WAITER') }),
  z.object({ type: z.literal('BRING_BILL'), paymentMethod: z.enum(['CASH', 'CARD']) }),
]);

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw guestError(400, 'INVALID_REQUEST');
  return r.data;
}

/** Действия гостя за столом. Доступ — по подписанному токену стола. */
@Controller('public')
export class GuestController {
  constructor(
    private readonly orders: GuestOrdersService,
    private readonly bills: GuestBillService,
    private readonly reviews: GuestReviewService,
  ) {}

  @Post('orders/:slug/:token')
  @HttpCode(201)
  createOrder(@Param('slug') slug: string, @Param('token') token: string, @Body() body: unknown): Promise<CreateOrderResponse> {
    return this.orders.create(slug, token, parse<CreateOrderRequest>(createOrderSchema, body));
  }

  @Get('bill/:slug/:token')
  @Header('Cache-Control', 'no-store')
  getBill(@Param('slug') slug: string, @Param('token') token: string): Promise<GuestBillDto> {
    return this.bills.getBill(slug, token);
  }

  @Post('calls/:slug/:token')
  @HttpCode(201)
  createCall(@Param('slug') slug: string, @Param('token') token: string, @Body() body: unknown) {
    return this.bills.createCall(slug, token, parse<CreateCallRequest>(createCallSchema, body));
  }

  @Get('reviews/:slug/:token/:billId')
  @Header('Cache-Control', 'no-store')
  reviewStatus(@Param('slug') slug: string, @Param('token') token: string, @Param('billId') billId: string) {
    return this.reviews.status(slug, token, billId);
  }

  @Post('reviews/:slug/:token')
  @HttpCode(201)
  createReview(@Param('slug') slug: string, @Param('token') token: string, @Body() body: unknown) {
    return this.reviews.create(slug, token, parse<ReviewRequest>(reviewSchema, body));
  }
}
