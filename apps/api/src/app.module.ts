import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthController } from './health/health.controller';
import { PublicMenuModule } from './public-menu/public-menu.module';
import { RealtimeModule } from './realtime/realtime.module';
import { GuestModule } from './guest/guest.module';
import { StaffAuthModule, StaffModule } from './staff/staff.module';

@Module({
  imports: [PrismaModule, RedisModule, StaffAuthModule, PublicMenuModule, RealtimeModule, GuestModule, StaffModule],
  controllers: [HealthController],
})
export class AppModule {}
