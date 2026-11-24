import { Module } from '@nestjs/common';
import { PublicMenuModule } from '../public-menu/public-menu.module';
import { RateLimitService } from '../common/rate-limit.service';
import { GuestController } from './guest.controller';
import { GuestOrdersService } from './guest-orders.service';
import { GuestBillService } from './guest-bill.service';

@Module({
  imports: [PublicMenuModule],
  controllers: [GuestController],
  providers: [GuestOrdersService, GuestBillService, RateLimitService],
})
export class GuestModule {}
