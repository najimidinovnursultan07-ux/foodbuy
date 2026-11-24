import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const).catch(() => 'down' as const),
      this.redis.ping().then(() => 'ok' as const).catch(() => 'down' as const),
    ]);
    return { status: db === 'ok' && redis === 'ok' ? 'ok' : 'degraded', db, redis };
  }
}
