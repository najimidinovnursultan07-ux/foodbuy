import type { DishDto } from '@qrmenu/shared';
import type { Messages } from '@/lib/i18n';
import s from './guest.module.css';

/** 1000 б.п. → «10», 1250 → «12,5» */
export const feePercent = (bp: number) => String(bp / 100).replace('.', ',');

export function weightLabel(dish: Pick<DishDto, 'weightValue' | 'weightUnit'>, t: Messages): string | null {
  if (dish.weightValue == null || !dish.weightUnit) return null;
  return `${dish.weightValue} ${t.unit[dish.weightUnit]}`;
}

export function DishTags({ dish, t }: { dish: DishDto; t: Messages }) {
  const tags: [string, string][] = [];
  if (!dish.isAvailable) tags.push([t.unavailable, s.tagOff!]);
  if (dish.isHit) tags.push([t.hit, s.tagHit!]);
  if (dish.isSpicy) tags.push([t.spicy, s.tagSpicy!]);
  if (dish.isHalal) tags.push([t.halal, s.tagHalal!]);
  if (!tags.length) return null;
  return (
    <span className={s.tags}>
      {tags.map(([label, cls]) => (
        <span key={label} className={`${s.tag} ${cls}`}>
          {label}
        </span>
      ))}
    </span>
  );
}

/** Фото блюда или нейтральная плашка с первой буквой. Фото — WebP, ленивое. */
export function Thumb({ dish, name, size }: { dish: DishDto; name: string; size: number }) {
  if (dish.photoUrl) {
    return <img src={dish.photoUrl} alt="" width={size} height={size} loading="lazy" decoding="async" className={s.thumb} />;
  }
  return (
    <span className={s.thumbEmpty} style={{ width: size, height: size }} aria-hidden="true">
      {name.match(/\p{L}/u)?.[0] ?? ''}
    </span>
  );
}
