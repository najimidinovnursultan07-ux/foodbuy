import { Injectable } from '@nestjs/common';
import type { AdminStaffDto, StaffInput } from '@qrmenu/shared';
import { hashPin, normalizeKgPhone } from '@qrmenu/shared/server';
import { PrismaService } from '../prisma/prisma.module';
import { staffError } from '../common/api-error';
import type { AuthedStaff } from '../staff/staff-auth.service';

@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string): Promise<AdminStaffDto[]> {
    const staff = await this.prisma.staff.findMany({ where: { restaurantId }, orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }] });
    return staff.map((s) => ({ id: s.id, name: s.name, phone: s.phone, role: s.role, station: s.station, isActive: s.isActive }));
  }

  async create(restaurantId: string, input: StaffInput) {
    if (!input.pin) throw staffError(400, 'INVALID_REQUEST', { issues: ['pin'] });
    const phone = this.phone(input.phone);
    await this.assertPhoneFree(restaurantId, phone);
    const s = await this.prisma.staff.create({
      data: {
        restaurantId,
        name: input.name,
        phone,
        role: input.role,
        station: input.role === 'kitchen' ? input.station : null,
        isActive: input.isActive,
        pinHash: hashPin(input.pin),
      },
    });
    return { id: s.id };
  }

  /** Смена PIN, роли или увольнение сразу обрывают сессии этого сотрудника. */
  async update(restaurantId: string, me: AuthedStaff, id: string, input: StaffInput) {
    const current = await this.prisma.staff.findFirst({ where: { id, restaurantId } });
    if (!current) throw staffError(404, 'NOT_FOUND');
    // Менеджер не может сам себя уволить или лишить прав — иначе в панель никто не войдёт
    if (id === me.id && (!input.isActive || input.role !== 'manager')) throw staffError(409, 'SELF_LOCKOUT');
    const phone = this.phone(input.phone);
    if (phone !== current.phone) await this.assertPhoneFree(restaurantId, phone);
    await this.prisma.staff.update({
      where: { id },
      data: {
        name: input.name,
        phone,
        role: input.role,
        station: input.role === 'kitchen' ? input.station : null,
        isActive: input.isActive,
        ...(input.pin ? { pinHash: hashPin(input.pin) } : {}),
      },
    });
    return { id };
  }

  private phone(raw: string): string {
    const p = normalizeKgPhone(raw);
    if (!p) throw staffError(400, 'INVALID_PHONE');
    return p;
  }

  private async assertPhoneFree(restaurantId: string, phone: string) {
    if (await this.prisma.staff.count({ where: { restaurantId, phone } })) throw staffError(409, 'PHONE_TAKEN');
  }
}
