import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { guestError } from './guest-error';

/** Фиксированное окно в Redis. Превышение — 429 RATE_LIMITED. */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSec: number): Promise<void> {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const [[, count]] = (await this.redis.multi().incr(k).expire(k, windowSec).exec()) as [[null, number], unknown];
    if (count > limit) throw guestError(429, 'RATE_LIMITED');
  }
}
