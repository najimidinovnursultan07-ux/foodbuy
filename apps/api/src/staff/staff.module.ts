import { Global, Module } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import { StaffAuthGuard } from './staff-auth.guard';
import { KitchenService } from './kitchen.service';
import { WaiterService } from './waiter.service';
import { KitchenController, StaffAuthController, WaiterController } from './staff.controller';

/** Вход персонала глобальный — им пользуется и WebSocket-шлюз. */
@Global()
@Module({
  providers: [StaffAuthService, StaffAuthGuard],
  exports: [StaffAuthService, StaffAuthGuard],
})
export class StaffAuthModule {}

@Module({
  controllers: [StaffAuthController, KitchenController, WaiterController],
  providers: [KitchenService, WaiterService],
})
export class StaffModule {}
