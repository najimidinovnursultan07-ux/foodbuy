import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthController } from './health/health.controller';
import { PublicMenuModule } from './public-menu/public-menu.module';
import { RealtimeModule } from './realtime/realtime.module';
import { GuestModule } from './guest/guest.module';
import { StaffAuthModule, StaffModule } from './staff/staff.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [PrismaModule, RedisModule, StaffAuthModule, NotificationsModule, PublicMenuModule, RealtimeModule, GuestModule, StaffModule, AdminModule, PlatformModule],
  controllers: [HealthController],
})
export class AppModule {}
