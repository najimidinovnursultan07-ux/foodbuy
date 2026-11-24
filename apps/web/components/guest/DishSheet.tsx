'use client';

import { useEffect, useRef, useState } from 'react';
import {
  defaultSelection,
  formatSom,
  pickText,
  toggleModifier,
  unitPrice,
  validateSelection,
  type DishDto,
  type Locale,
  type PublicMenuDto,
} from '@qrmenu/shared';
import { messages } from '@/lib/i18n';
import type { CartLine } from '@/lib/cart';
import { DishTags, Thumb, weightLabel } from './parts';
import s from './guest.module.css';

interface Props {
  dish: DishDto;
  menu: PublicMenuDto;
  locale: Locale;
  canOrder: boolean;
  onClose: () => void;
  onOpenDish: (id: string) => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}

const MAX_QTY = 20;

export function DishSheet({ dish, menu, locale, canOrder, onClose, onOpenDish, onAdd }: Props) {
  const t = messages(locale);
  const ref = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState(() => defaultSelection(dish));
  const [comment, setComment] = useState('');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    // close() при размонтировании не зовём: его асинхронное событие close
    // закрыло бы уже следующую карточку (переход по «к этому берут»).
  }, []);

  const name = pickText(dish.name, locale);
  const desc = pickText(dish.description, locale);
  const errors = validateSelection(dish, selection);
  const price = unitPrice(dish, selection);
  const upsells = dish.upsellIds.map((id) => menu.dishes[id]).filter((d): d is DishDto => !!d);
  const orderable = canOrder && dish.isAvailable;

  return (
    <dialog
      ref={ref}
      className={s.sheet}
      aria-labelledby="dish-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()} // тап по фону
    >
      <div className={s.sheetBody}>
        <button type="button" className={s.closeBtn} onClick={onClose} aria-label={t.close}>
          ×
        </button>
        {dish.photoUrl && <Thumb dish={dish} name={name} size={640} />}
        <h2 id="dish-title" className={s.sheetTitle}>
          {name}
        </h2>
        <DishTags dish={dish} t={t} />
        {desc && <p className={s.sheetDesc}>{desc}</p>}
        <p className={s.dishMeta}>
          <strong className={s.price}>{formatSom(dish.priceTyiyn)}</strong>
          {weightLabel(dish, t) && <span className={s.weight}>{weightLabel(dish, t)}</span>}
        </p>

        {orderable &&
          dish.modifierGroups.map((g) => {
            const radio = g.maxSelect === 1;
            const chosen = selection[g.id] ?? [];
            const hasError = errors.some((e) => e.groupId === g.id);
            return (
              <fieldset key={g.id} className={s.group}>
                <legend className={s.groupTitle}>
                  {pickText(g.name, locale)}{' '}
                  <span className={s.groupHint} data-error={hasError || undefined}>
                    {g.minSelect > 0 ? t.required : ''}
                    {!radio && ` · ${t.chooseUpTo(g.maxSelect)}`}
                  </span>
                </legend>
                {g.modifiers.map((m) => (
                  <label key={m.id} className={s.option} data-disabled={!m.isAvailable || undefined}>
                    <input
                      type={radio ? 'radio' : 'checkbox'}
                      name={g.id}
                      checked={chosen.includes(m.id)}
                      disabled={!m.isAvailable || (!radio && !chosen.includes(m.id) && chosen.length >= g.maxSelect)}
                      onChange={() => setSelection((cur) => toggleModifier(g, cur, m.id))}
                    />
                    <span className={s.optionName}>{pickText(m.name, locale)}</span>
                    {m.priceDeltaTyiyn !== 0 && <span className={s.optionPrice}>+{formatSom(m.priceDeltaTyiyn)}</span>}
                  </label>
                ))}
              </fieldset>
            );
          })}

        {orderable && (
          <label className={s.commentLabel}>
            {t.comment}
            <textarea
              className={s.comment}
              value={comment}
              maxLength={200}
              rows={2}
              placeholder={t.commentPlaceholder}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
        )}

        {upsells.length > 0 && (
          <section className={s.upsells} aria-labelledby="upsell-title">
            <h3 id="upsell-title" className={s.groupTitle}>
              {t.upsellTitle}
            </h3>
            <ul className={s.upsellList}>
              {upsells.map((u) => (
                <li key={u.id}>
                  <button type="button" className={s.upsell} onClick={() => onOpenDish(u.id)} data-unavailable={!u.isAvailable || undefined}>
                    <Thumb dish={u} name={pickText(u.name, locale)} size={56} />
                    <span className={s.upsellName}>{pickText(u.name, locale)}</span>
                    <span className={s.weight}>{formatSom(u.priceTyiyn)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {orderable && (
        <div className={s.sheetFooter}>
          <div className={s.stepper} role="group" aria-label={t.quantity}>
            <button type="button" aria-label={t.decrease} disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>
              −
            </button>
            <output aria-live="polite">{qty}</output>
            <button type="button" aria-label={t.increase} disabled={qty >= MAX_QTY} onClick={() => setQty((q) => q + 1)}>
              +
            </button>
          </div>
          <button
            type="button"
            className={s.primary}
            disabled={errors.length > 0}
            onClick={() => onAdd({ dishId: dish.id, selection, comment, quantity: qty, unitPriceTyiyn: price })}
          >
            {errors.length > 0 ? t.chooseOne : `${t.add} · ${formatSom(price * qty)}`}
          </button>
        </div>
      )}
    </dialog>
  );
}
