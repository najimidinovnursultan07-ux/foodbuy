'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatSom, pickText, textOnAccent, type DishDto, type Locale, type PublicMenuDto } from '@qrmenu/shared';
import { LANG_COOKIE, LOCALE_LABELS, messages } from '@/lib/i18n';
import { useCart } from '@/lib/cart';
import { DishSheet } from './DishSheet';
import { DishTags, Thumb, weightLabel } from './parts';
import s from './guest.module.css';

export function GuestMenu({ menu, initialLocale }: { menu: PublicMenuDto; initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [openDishId, setOpenDishId] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState(menu.categories[0]?.id);
  const t = messages(locale);
  const canOrder = menu.restaurant.status === 'ACTIVE';
  const cart = useCart(menu.restaurant.slug, menu.table.id);
  const tabsRef = useRef<HTMLElement>(null);

  const theme = useMemo(
    () =>
      ({
        '--accent': menu.restaurant.accentColor,
        '--on-accent': textOnAccent(menu.restaurant.accentColor),
      }) as CSSProperties,
    [menu.restaurant.accentColor],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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

  function changeLocale(next: Locale) {
    setLocale(next);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

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
            <button
              key={l}
              type="button"
              lang={l}
              className={s.lang}
              aria-pressed={l === locale}
              onClick={() => changeLocale(l)}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </header>

      <nav className={s.tabs} aria-label={t.categories} ref={tabsRef}>
        {menu.categories.map((c) => (
          <a
            key={c.id}
            href={`#cat-${c.id}`}
            data-cat={c.id}
            className={s.tab}
            aria-current={c.id === activeCat ? 'true' : undefined}
          >
            {pickText(c.name, locale)}
          </a>
        ))}
      </nav>

      {!canOrder && <p className={s.notice}>{t.menuOnly}</p>}

      <main className={s.list}>
        {menu.categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className={s.section} aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`} className={s.sectionTitle}>
              {pickText(c.name, locale)}
            </h2>
            <ul className={s.dishes}>
              {c.dishIds.map((id) => {
                const d = menu.dishes[id];
                return d ? <DishRow key={id} dish={d} locale={locale} onOpen={() => setOpenDishId(id)} /> : null;
              })}
            </ul>
          </section>
        ))}
      </main>

      {canOrder && cart.count > 0 && (
        <div className={s.cartBar} role="status" data-testid="cart-bar">
          <span>
            {t.cart} · {t.cartItems(cart.count)}
          </span>
          <strong>{formatSom(cart.total)}</strong>
        </div>
      )}

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

function DishRow({ dish, locale, onOpen }: { dish: DishDto; locale: Locale; onOpen: () => void }) {
  const t = messages(locale);
  const name = pickText(dish.name, locale);
  const desc = pickText(dish.description, locale);
  return (
    <li>
      <button
        type="button"
        className={s.dish}
        data-unavailable={!dish.isAvailable || undefined}
        onClick={onOpen}
        data-testid="dish"
      >
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
