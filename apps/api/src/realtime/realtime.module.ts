import { Global, Module } from '@nestjs/common';
import { PublicMenuModule } from '../public-menu/public-menu.module';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [PublicMenuModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
