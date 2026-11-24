import { z } from 'zod';
import { isValidHours, type LocalizedText, type OpeningHours } from '@qrmenu/shared';
import { staffError } from '../common/api-error';

export function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw staffError(400, 'INVALID_REQUEST', { issues: r.error.issues.map((i) => i.path.join('.')) });
  return r.data;
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Текст на трёх языках: ru обязателен, пустые ky/en отбрасываются. */
export const localized = (max = 120) =>
  z.object({ ru: z.string().trim().min(1).max(max), ky: opt(max), en: opt(max) }).transform((v) => {
    const out: LocalizedText = { ru: v.ru };
    if (v.ky) out.ky = v.ky;
    if (v.en) out.en = v.en;
    return out;
  });

/** Описание: если ru пустой — описания нет. */
export const description = z
  .object({ ru: z.string().trim().max(500), ky: opt(500), en: opt(500) })
  .nullable()
  .transform((v) => (v && v.ru ? localized(500).parse(v) : null));

export const id = z.string().min(1).max(64);
export const money = z.number().int().min(0).max(100_000_000); // тыйыны, до 1 млн сом
export const station = z.enum(['KITCHEN', 'BAR']);

export const dishSchema = z.object({
  categoryId: id,
  name: localized(),
  description,
  priceTyiyn: money,
  weightValue: z.number().int().min(1).max(100_000).nullable(),
  weightUnit: z.enum(['G', 'ML', 'PCS']).nullable(),
  station,
  isHit: z.boolean(),
  isSpicy: z.boolean(),
  isHalal: z.boolean(),
  isAvailable: z.boolean(),
  isActive: z.boolean(),
});

export const modifierGroupsSchema = z.object({
  groups: z
    .array(
      z.object({
        id: id.optional(),
        name: localized(),
        minSelect: z.number().int().min(0).max(20),
        maxSelect: z.number().int().min(1).max(20),
        modifiers: z
          .array(
            z.object({
              id: id.optional(),
              name: localized(),
              priceDeltaTyiyn: money,
              isDefault: z.boolean(),
              isAvailable: z.boolean(),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .max(10),
});

export const hoursSchema = z.custom<OpeningHours>((v) => isValidHours(v));

const twoGis = z
  .string()
  .trim()
  .url()
  .refine((u) => {
    // Только 2GIS: ссылка уходит гостям после хорошего отзыва
    const { protocol, hostname } = new URL(u);
    return protocol === 'https:' && /(^|\.)2gis\.(kg|ru|com|kz)$/.test(hostname);
  });

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  defaultLocale: z.enum(['ru', 'ky', 'en']),
  serviceFeeBp: z.number().int().min(0).max(3000),
  orderFlow: z.enum(['DIRECT_TO_KITCHEN', 'WAITER_CONFIRM']),
  orderAlertMinutes: z.number().int().min(3).max(180),
  twoGisUrl: twoGis.nullable(),
  reportHour: z.number().int().min(0).max(23),
  openingHours: hoursSchema,
});

export const staffSchema = z.object({
  name: z.string().trim().min(1).max(60),
  phone: z.string().min(5).max(32),
  role: z.enum(['waiter', 'kitchen', 'manager']),
  station: station.nullable(),
  isActive: z.boolean(),
  pin: z
    .string()
    .regex(/^\d{4,6}$/)
    .optional(),
});

export const dateRange = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .refine((r) => r.from <= r.to);
