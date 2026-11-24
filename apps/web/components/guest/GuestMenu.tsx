'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  formatSom,
  pickText,
  textOnAccent,
  type DishDto,
  type Locale,
  type PaymentMethodDto,
  type PublicMenuDto,
} from '@qrmenu/shared';
import { LANG_COOKIE, LOCALE_LABELS, messages } from '@/lib/i18n';
import { useCart } from '@/lib/cart';
import { useTableBill } from '@/lib/use-table-bill';
import { GuestApiError, guestApi } from '@/lib/guest-api';
import { DishSheet } from './DishSheet';
import { CartView } from './CartView';
import { BillView } from './BillView';
import { DishTags, Thumb, weightLabel } from './parts';
import s from './guest.module.css';

type View = 'menu' | 'cart' | 'bill';
const toView = (v: string | null): View => (v === 'cart' || v === 'bill' ? v : 'menu');

export function GuestMenu({ menu, token, initialLocale }: { menu: PublicMenuDto; token: string; initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [openDishId, setOpenDishId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = messages(locale);
  const slug = menu.restaurant.slug;
  const canOrder = menu.restaurant.status === 'ACTIVE';
  const cart = useCart(slug, menu.table.id);
  const { bill, refresh } = useTableBill(slug, token);

  // Экран (меню / корзина / счёт) — в ?view=, через history API: без запроса к серверу, «назад» работает
  const view = toView(useSearchParams().get('view'));
  function go(next: View) {
    window.history.pushState(null, '', next === 'menu' ? window.location.pathname : `?view=${next}`);
    window.scrollTo(0, 0);
  }

  const theme = useMemo(
    () => ({ '--accent': menu.restaurant.accentColor, '--on-accent': textOnAccent(menu.restaurant.accentColor) }) as CSSProperties,
    [menu.restaurant.accentColor],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  function changeLocale(next: Locale) {
    setLocale(next);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  async function callWaiter(type: 'CALL_WAITER' | 'BRING_BILL', paymentMethod?: PaymentMethodDto) {
    setBusy(true);
    try {
      await guestApi.createCall(slug, token, type === 'BRING_BILL' ? { type, paymentMethod: paymentMethod! } : { type });
      setToast(type === 'BRING_BILL' ? t.billRequested(t.pay[paymentMethod!]) : t.waiterComing);
      await refresh();
    } catch (e) {
      const code = e instanceof GuestApiError ? e.body?.code : undefined;
      setToast(code === 'RATE_LIMITED' ? t.errRateLimited : code === 'NO_OPEN_BILL' ? t.errNoBill : t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  const waiterCalled = bill?.openCalls.some((c) => c.type === 'CALL_WAITER') ?? false;
  const orders = bill?.bill?.orders ?? [];
  const lastOrder = orders[orders.length - 1];
  const openDish = openDishId ? menu.dishes[openDishId] : undefined;

  return (
    <div className={s.page} style={theme}>
      <header className={s.header}>
        <div className={s.brand}>
          {menu.restaurant.logoUrl && <img src={menu.restaurant.logoUrl} alt="" width={40} height={40} className={s.logo} />}
          <div>
            <h1 className={s.title}>{menu.restaurant.name}</h1>
            <p className={s.subtitle}>
              {t.table} {menu.table.label}
            </p>
          </div>
        </div>
        <div className={s.langs} role="group" aria-label={t.language}>
          {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
            <button key={l} type="button" lang={l} className={s.lang} aria-pressed={l === locale} onClick={() => changeLocale(l)}>
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </header>

      {view === 'menu' ? (
        <MenuView menu={menu} locale={locale} onOpenDish={setOpenDishId}>
          {!canOrder && <p className={s.notice}>{t.menuOnly}</p>}
          {canOrder && (
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                disabled={busy || waiterCalled}
                onClick={() => callWaiter('CALL_WAITER')}
              >
                {waiterCalled ? `✓ ${t.waiterComing}` : `🔔 ${t.callWaiter}`}
              </button>
              {lastOrder && (
                <button type="button" className={s.secondary} onClick={() => go('bill')} data-testid="bill-link">
                  {t.myBill} · {t.status[lastOrder.status]}
                </button>
              )}
            </div>
          )}
        </MenuView>
      ) : (
        <main className={s.list}>
          <button type="button" className={s.back} onClick={() => go('menu')}>
            ← {t.backToMenu}
          </button>
          <h2 className={s.sectionTitle}>{view === 'cart' ? t.cart : t.billTitle(menu.table.label)}</h2>
          {view === 'cart' ? (
            <CartView
              menu={menu}
              token={token}
              locale={locale}
              cart={cart}
              onOpenDish={setOpenDishId}
              onSubmitted={() => {
                setToast(t.orderSent);
                void refresh();
                window.history.replaceState(null, '', '?view=bill');
              }}
            />
          ) : (
            <BillView
              bill={bill}
              locale={locale}
              canOrder={canOrder}
              busy={busy}
              onAddMore={() => go('menu')}
              onRequestBill={(m) => callWaiter('BRING_BILL', m)}
            />
          )}
        </main>
      )}

      {view === 'menu' && canOrder && cart.count > 0 && (
        <button type="button" className={s.cartBar} onClick={() => go('cart')} data-testid="cart-bar">
          <span>
            {t.cart} · {t.cartItems(cart.count)}
          </span>
          <strong>{formatSom(cart.total)}</strong>
        </button>
      )}

      <div className={s.toast} role="status" aria-live="polite">
        {toast}
      </div>

      {openDish && (
        <DishSheet
          key={openDish.id}
          dish={openDish}
          menu={menu}
          locale={locale}
          canOrder={canOrder}
          onClose={() => setOpenDishId(null)}
          onOpenDish={setOpenDishId}
          onAdd={(line) => {
            cart.add(line);
            setOpenDishId(null);
          }}
        />
      )}
    </div>
  );
}

function MenuView({
  menu,
  locale,
  onOpenDish,
  children,
}: {
  menu: PublicMenuDto;
  locale: Locale;
  onOpenDish: (id: string) => void;
  children: React.ReactNode;
}) {
  const t = messages(locale);
  const [activeCat, setActiveCat] = useState(menu.categories[0]?.id);
  const tabsRef = useRef<HTMLElement>(null);

  // Подсветка категории, которая сейчас на экране
  useEffect(() => {
    const sections = menu.categories
      .map((c) => document.getElementById(`cat-${c.id}`))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCat(visible[0].target.id.slice(4));
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [menu.categories]);

  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeCat]);

  return (
    <>
      {children}
      <nav className={s.tabs} aria-label={t.categories} ref={tabsRef}>
        {menu.categories.map((c) => (
          <a key={c.id} href={`#cat-${c.id}`} data-cat={c.id} className={s.tab} aria-current={c.id === activeCat ? 'true' : undefined}>
            {pickText(c.name, locale)}
          </a>
        ))}
      </nav>
      <main className={s.list}>
        {menu.categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className={s.section} aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`} className={s.sectionTitle}>
              {pickText(c.name, locale)}
            </h2>
            <ul className={s.dishes}>
              {c.dishIds.map((id) => {
                const d = menu.dishes[id];
                return d ? <DishRow key={id} dish={d} locale={locale} onOpen={() => onOpenDish(id)} /> : null;
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}

function DishRow({ dish, locale, onOpen }: { dish: DishDto; locale: Locale; onOpen: () => void }) {
  const t = messages(locale);
  const name = pickText(dish.name, locale);
  const desc = pickText(dish.description, locale);
  return (
    <li>
      <button type="button" className={s.dish} data-unavailable={!dish.isAvailable || undefined} onClick={onOpen} data-testid="dish">
        <span className={s.dishText}>
          <span className={s.dishName}>{name}</span>
          {desc && <span className={s.dishDesc}>{desc}</span>}
          <DishTags dish={dish} t={t} />
          <span className={s.dishMeta}>
            <strong className={s.price}>{formatSom(dish.priceTyiyn)}</strong>
            {weightLabel(dish, t) && <span className={s.weight}>{weightLabel(dish, t)}</span>}
          </span>
        </span>
        <Thumb dish={dish} name={name} size={88} />
      </button>
    </li>
  );
}
