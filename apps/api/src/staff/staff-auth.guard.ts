import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRoleDto } from '@qrmenu/shared';
import { staffError } from '../common/api-error';
import { StaffAuthService, type AuthedStaff } from './staff-auth.service';

const ROLES = 'staff_roles';
/** Какие роли допускаются. Без декоратора — любой вошедший сотрудник. */
export const Roles = (...roles: StaffRoleDto[]) => SetMetadata(ROLES, roles);

type Req = { headers: Record<string, string | undefined>; staff?: AuthedStaff };

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Req>();
    const header = req.headers.authorization ?? '';
    const staff = await this.auth.resolve(header.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!staff) throw staffError(401, 'UNAUTHORIZED');
    const roles = this.reflector.getAllAndOverride<StaffRoleDto[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (roles && !roles.includes(staff.role)) throw staffError(403, 'FORBIDDEN');
    req.staff = staff;
    return true;
  }
}

/** Текущий сотрудник; его restaurantId — граница всех запросов к данным. */
export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedStaff => {
  return ctx.switchToHttp().getRequest<Req>().staff!;
});
