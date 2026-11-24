import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { PlatformAdmin } from '@qrmenu/db';
import type { PlatformLoginResponse } from '@qrmenu/shared';
import { normalizeKgPhone, pinFingerprint, signPlatformSession, verifyPin, verifyPlatformSession } from '@qrmenu/shared/server';
import { PrismaService } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { requireEnv } from '../config/env';
import { staffError } from '../common/api-error';

const MAX_FAILS = 5;
const FAIL_WINDOW_SEC = 15 * 60;

/** Вход сотрудников платформы. Токен подписан с отдельной областью — токен ресторана сюда не подходит. */
@Injectable()
export class PlatformAuthService {
  private readonly secret = requireEnv('JWT_SECRET');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async login(phoneRaw: string, pin: string): Promise<PlatformLoginResponse> {
    const phone = normalizeKgPhone(phoneRaw);
    if (!phone) throw staffError(401, 'INVALID_CREDENTIALS');
    const failKey = `plogin:fail:${phone}`;
    if (Number(await this.redis.get(failKey)) >= MAX_FAILS) throw staffError(429, 'RATE_LIMITED');
    const admin = await this.prisma.platformAdmin.findFirst({ where: { phone, isActive: true } });
    if (!admin || !verifyPin(pin, admin.pinHash)) {
      await this.redis.multi().incr(failKey).expire(failKey, FAIL_WINDOW_SEC).exec();
      throw staffError(401, 'INVALID_CREDENTIALS');
    }
    await this.redis.del(failKey);
    return {
      token: signPlatformSession({ sid: admin.id, pv: pinFingerprint(admin.pinHash) }, this.secret),
      admin: { id: admin.id, name: admin.name },
    };
  }

  async resolve(token: string | undefined): Promise<PlatformAdmin | null> {
    if (!token) return null;
    const s = verifyPlatformSession(token, this.secret);
    if (!s) return null;
    const admin = await this.prisma.platformAdmin.findFirst({ where: { id: s.sid, isActive: true } });
    return admin && pinFingerprint(admin.pinHash) === s.pv ? admin : null;
  }
}

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly auth: PlatformAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const header = req.headers.authorization ?? '';
    const admin = await this.auth.resolve(header.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!admin) throw staffError(401, 'UNAUTHORIZED');
    return true;
  }
}
