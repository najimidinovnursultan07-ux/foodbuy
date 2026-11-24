'use client';

import { useMemo, useState } from 'react';
import { formatSom, pickText, type DishDto, type Locale, type PublicMenuDto } from '@qrmenu/shared';
import { messages } from '@/lib/i18n';
import type { Cart } from '@/lib/cart';
import { GuestApiError, deviceId, guestApi } from '@/lib/guest-api';
import { Thumb, feePercent } from './parts';
import s from './guest.module.css';

interface Props {
  menu: PublicMenuDto;
  token: string;
  locale: Locale;
  cart: Cart;
  onOpenDish: (id: string) => void;
  onSubmitted: () => void;
}

export function CartView({ menu, token, locale, cart, onOpenDish, onSubmitted }: Props) {
  const t = messages(locale);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badDishes, setBadDishes] = useState<string[]>([]);

  // Позиции, блюд которых уже нет в меню, не показываем и не отправляем
  const lines = cart.lines.filter((l) => menu.dishes[l.dishId]);

  // Ключ идемпотентности живёт, пока не меняется содержимое корзины:
  // повтор после обрыва сети вернёт уже созданный заказ, а не создаст второй.
  const signature = JSON.stringify(lines.map((l) => [l.key, l.quantity]));
  const clientRequestId = useMemo(() => crypto.randomUUID(), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  // «К этому берут» по всей корзине: без того, что уже в корзине, и без стоп-листа
  const upsells = useMemo(() => {
    const inCart = new Set(lines.map((l) => l.dishId));
    const seen = new Set<string>();
    const out: DishDto[] = [];
    for (const l of lines) {
      for (const id of menu.dishes[l.dishId]?.upsellIds ?? []) {
        const d = menu.dishes[id];
        if (d && d.isAvailable && !inCart.has(id) && !seen.has(id)) {
          seen.add(id);
          out.push(d);
        }
      }
    }
    return out.slice(0, 6);
  }, [lines, menu.dishes]);

  async function submit() {
    setSending(true);
    setError(null);
    try {
      await guestApi.createOrder(menu.restaurant.slug, token, {
        deviceId: deviceId(),
        clientRequestId,
        items: lines.map((l) => ({ dishId: l.dishId, selection: l.selection, comment: l.comment || undefined, quantity: l.quantity })),
      });
      cart.clear();
      onSubmitted();
    } catch (e) {
      const body = e instanceof GuestApiError ? e.body : null;
      const ids = body?.dishIds ?? [];
      setBadDishes(ids);
      if (body?.code === 'DISH_UNAVAILABLE') {
        setError(t.errUnavailable(ids.map((id) => pickText(menu.dishes[id]?.name, locale)).join(', ')));
      } else if (body?.code === 'INVALID_MODIFIERS') setError(t.errModifiers);
      else if (body?.code === 'RATE_LIMITED') setError(t.errRateLimited);
      else if (body?.code === 'ORDERING_DISABLED') setError(t.menuOnly);
      else if (body?.code === 'RESTAURANT_CLOSED') setError(t.closedNow);
      else setError(t.errGeneric);
    } finally {
      setSending(false);
    }
  }

  if (lines.length === 0) {
    return <p className={s.empty}>{t.emptyCart}</p>;
  }

  return (
    <>
      <ul className={s.lines}>
        {lines.map((l) => {
          const dish = menu.dishes[l.dishId]!;
          const mods = dish.modifierGroups.flatMap((g) =>
            g.modifiers.filter((m) => (l.selection[g.id] ?? []).includes(m.id)).map((m) => pickText(m.name, locale)),
          );
          return (
            <li key={l.key} className={s.line} data-bad={badDishes.includes(l.dishId) || undefined} data-testid="cart-line">
              <div className={s.lineText}>
                <span className={s.dishName}>{pickText(dish.name, locale)}</span>
                {mods.length > 0 && <span className={s.dishDesc}>{mods.join(', ')}</span>}
                {l.comment && <span className={s.lineComment}>«{l.comment}»</span>}
                <strong className={s.price}>{formatSom(l.unitPriceTyiyn * l.quantity)}</strong>
              </div>
              <div className={s.stepper} role="group" aria-label={t.quantity}>
                <button
                  type="button"
                  aria-label={l.quantity === 1 ? t.remove : t.decrease}
                  onClick={() => cart.setQuantity(l.key, l.quantity - 1)}
                >
                  {l.quantity === 1 ? '×' : '−'}
                </button>
                <output>{l.quantity}</output>
                <button type="button" aria-label={t.increase} disabled={l.quantity >= 20} onClick={() => cart.setQuantity(l.key, l.quantity + 1)}>
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {upsells.length > 0 && (
        <section className={s.upsells} aria-labelledby="cart-upsell-title">
          <h3 id="cart-upsell-title" className={s.groupTitle}>
            {t.upsellTitle}
          </h3>
          <ul className={s.upsellList}>
            {upsells.map((u) => (
              <li key={u.id}>
                <button type="button" className={s.upsell} onClick={() => onOpenDish(u.id)}>
                  <Thumb dish={u} name={pickText(u.name, locale)} size={56} />
                  <span className={s.upsellName}>{pickText(u.name, locale)}</span>
                  <span className={s.weight}>{formatSom(u.priceTyiyn)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={s.summary}>
        {menu.restaurant.serviceFeeBp > 0 && <p className={s.hint}>{t.feeHint(feePercent(menu.restaurant.serviceFeeBp))}</p>}
        {menu.restaurant.orderFlow === 'WAITER_CONFIRM' && <p className={s.hint}>{t.confirmHint}</p>}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </div>

      <div className={s.bottomAction}>
        <button type="button" className={s.primary} disabled={sending} onClick={submit}>
          {sending ? t.sending : `${t.sendOrder} · ${formatSom(cart.total)}`}
        </button>
      </div>
    </>
  );
}
