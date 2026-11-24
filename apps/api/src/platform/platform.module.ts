import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateRestaurantRequest, SetSubscriptionRequest } from '@qrmenu/shared';
import { parse } from '../admin/schemas';
import { PlatformAuthService, PlatformGuard } from './platform-auth';
import { PlatformService } from './platform.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const status = z.enum(['ACTIVE', 'MENU_ONLY', 'DISABLED']);
const subStatus = z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/),
  managerName: z.string().trim().min(1).max(60),
  managerPhone: z.string().min(5).max(32),
  managerPin: z.string().regex(/^\d{4,6}$/),
  planId: z.string().min(1).max(64),
  trialDays: z.number().int().min(0).max(90),
});
const subscriptionSchema = z.object({ planId: z.string().min(1).max(64), status: subStatus, periodEnd: date, note: z.string().max(300).nullish() });
const planSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]{2,30}$/),
  name: z.string().trim().min(1).max(60),
  priceTyiyn: z.number().int().min(0).max(1_000_000_00),
  maxTables: z.number().int().min(1).max(1000).nullable(),
  isActive: z.boolean(),
});

@Controller('platform')
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly platform: PlatformService,
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const b = parse(z.object({ phone: z.string().min(5).max(32), pin: z.string().regex(/^\d{4,6}$/) }), body);
    return this.auth.login(b.phone, b.pin);
  }

  @Get('restaurants')
  @UseGuards(PlatformGuard)
  restaurants() {
    return this.platform.restaurants();
  }

  @Post('restaurants')
  @UseGuards(PlatformGuard)
  create(@Body() body: unknown) {
    return this.platform.createRestaurant(parse<CreateRestaurantRequest>(createSchema, body));
  }

  @Patch('restaurants/:id')
  @UseGuards(PlatformGuard)
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.updateRestaurant(id, parse(z.object({ status: status.optional(), name: z.string().trim().min(1).max(80).optional() }), body));
  }

  @Put('restaurants/:id/subscription')
  @UseGuards(PlatformGuard)
  subscription(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.setSubscription(id, parse<SetSubscriptionRequest>(subscriptionSchema, body));
  }

  @Get('plans')
  @UseGuards(PlatformGuard)
  plans() {
    return this.platform.plans();
  }

  @Post('plans')
  @UseGuards(PlatformGuard)
  createPlan(@Body() body: unknown) {
    return this.platform.createPlan(parse(planSchema, body));
  }

  @Patch('plans/:id')
  @UseGuards(PlatformGuard)
  updatePlan(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.updatePlan(id, parse(planSchema.omit({ code: true }).partial(), body));
  }
}

@Module({
  controllers: [PlatformController],
  providers: [PlatformAuthService, PlatformGuard, PlatformService],
})
export class PlatformModule {}
