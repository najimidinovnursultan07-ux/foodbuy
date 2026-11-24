import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { Restaurant, Staff } from '@qrmenu/db';
import type { StaffLoginRequest, StaffLoginResponse, StaffProfileDto } from '@qrmenu/shared';
import { normalizeKgPhone, pinFingerprint, signSession, verifyPin, verifySession } from '@qrmenu/shared/server';
import { PrismaService } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { requireEnv } from '../config/env';
import { staffError } from '../common/api-error';

export type AuthedStaff = Staff & { restaurant: Restaurant };

const MAX_FAILS = 5;
const FAIL_WINDOW_SEC = 15 * 60;

@Injectable()
export class StaffAuthService {
  private readonly secret = requireEnv('JWT_SECRET');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async login(req: StaffLoginRequest): Promise<StaffLoginResponse> {
    const phone = normalizeKgPhone(req.phone);
    if (!phone) throw staffError(401, 'INVALID_CREDENTIALS');

    // Защита от перебора PIN: 5 неудачных попыток на номер за 15 минут
    const failKey = `login:fail:${phone}`;
    if (Number(await this.redis.get(failKey)) >= MAX_FAILS) throw staffError(429, 'RATE_LIMITED');

    const candidates = await this.prisma.staff.findMany({
      where: {
        phone,
        isActive: true,
        restaurant: { status: { not: 'DISABLED' }, ...(req.restaurantSlug ? { slug: req.restaurantSlug } : {}) },
      },
      include: { restaurant: true },
    });
    const matched = candidates.filter((c) => verifyPin(req.pin, c.pinHash));

    if (matched.length === 0) {
      await this.redis.multi().incr(failKey).expire(failKey, FAIL_WINDOW_SEC).exec();
      throw staffError(401, 'INVALID_CREDENTIALS');
    }
    if (matched.length > 1) {
      throw staffError(409, 'MULTIPLE_RESTAURANTS', {
        restaurants: matched.map((m) => ({ slug: m.restaurant.slug, name: m.restaurant.name })),
      });
    }
    await this.redis.del(failKey);

    const staff = matched[0]!;
    const token = signSession({ sid: staff.id, rid: staff.restaurantId, role: staff.role, pv: pinFingerprint(staff.pinHash) }, this.secret);
    return { token, staff: toProfile(staff) };
  }

  /**
   * Сотрудник по токену. Каждый раз сверяемся с БД: увольнение, смена PIN или роли
   * и выключение ресторана действуют сразу, без ожидания истечения токена.
   */
  async resolve(token: string | undefined): Promise<AuthedStaff | null> {
    if (!token) return null;
    const s = verifySession(token, this.secret);
    if (!s) return null;
    const staff = await this.prisma.staff.findFirst({
      where: { id: s.sid, restaurantId: s.rid, isActive: true, restaurant: { status: { not: 'DISABLED' } } },
      include: { restaurant: true },
    });
    if (!staff || pinFingerprint(staff.pinHash) !== s.pv) return null;
    return staff;
  }
}

export function toProfile(s: AuthedStaff): StaffProfileDto {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    station: s.station,
    restaurant: {
      slug: s.restaurant.slug,
      name: s.restaurant.name,
      accentColor: s.restaurant.accentColor,
      orderAlertMinutes: s.restaurant.orderAlertMinutes,
    },
  };
}
