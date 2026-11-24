'use client';

import { useState } from 'react';
import { pickText, type AdminMenuDto } from '@qrmenu/shared';
import { useAdmin, useAdminData } from '@/lib/admin-api';
import { ErrorNote, Toggle } from './fields';
import s from './admin.module.css';

/** Быстрый стоп-лист для смены: что закончилось — выключить одним касанием. */
export function StopList() {
  const { t, locale, api, errorText } = useAdmin();
  const { data: menu, error: loadError, setData } = useAdminData<AdminMenuDto>('/admin/menu');
  const [query, setQuery] = useState('');
  const [onlyStopped, setOnlyStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!menu) return <p className={s.loading}>{loadError ?? t.loading}</p>;

  // Оптимистичное обновление: переключатель реагирует сразу, при ошибке — откат
  async function toggle(path: string, isAvailable: boolean, apply: (m: AdminMenuDto, v: boolean) => AdminMenuDto) {
    const before = menu!;
    setData(apply(before, isAvailable));
    try {
      await api.send('PATCH', path, { isAvailable });
      setError(null);
    } catch (e) {
      setData(before);
      setError(errorText(e));
    }
  }

  const q = query.trim().toLowerCase();
  return (
    <section>
      <div className={s.pageHead}>
        <h1>{t.stopTitle}</h1>
      </div>
      <p className={s.muted}>{t.stopHint}</p>
      <div className={s.inline}>
        <input type="search" placeholder={t.search} aria-label={t.search} value={query} onChange={(e) => setQuery(e.target.value)} className={s.search} />
        <Toggle label={t.onlyStopped} checked={onlyStopped} onChange={setOnlyStopped} />
      </div>
      <ErrorNote text={error} />

      {menu.categories.map((c) => {
        const dishes = c.dishIds
          .map((id) => menu.dishes[id]!)
          .filter((d) => d.isActive)
          .filter((d) => !q || Object.values(d.name).some((n) => n?.toLowerCase().includes(q)))
          .filter((d) => !onlyStopped || !d.isAvailable || d.modifierGroups.some((g) => g.modifiers.some((m) => !m.isAvailable)));
        if (!dishes.length) return null;
        return (
          <article key={c.id} className={s.card}>
            <h2>{pickText(c.name, locale)}</h2>
            <ul className={s.rows}>
              {dishes.map((d) => (
                <li key={d.id} className={s.stopRow} data-off={!d.isAvailable || undefined} data-testid="stop-row">
                  <Toggle
                    label={<strong>{pickText(d.name, locale)}</strong>}
                    checked={d.isAvailable}
                    onChange={(v) =>
                      toggle(`/admin/dishes/${d.id}`, v, (m, val) => ({ ...m, dishes: { ...m.dishes, [d.id]: { ...m.dishes[d.id]!, isAvailable: val } } }))
                    }
                  />
                  {d.modifierGroups.flatMap((g) =>
                    g.modifiers.map((mod) => (
                      <div key={mod.id} className={s.stopMod}>
                        <Toggle
                          label={`${pickText(g.name, locale)}: ${pickText(mod.name, locale)}`}
                          checked={mod.isAvailable}
                          onChange={(v) =>
                            toggle(`/admin/modifiers/${mod.id}`, v, (m, val) => ({
                              ...m,
                              dishes: {
                                ...m.dishes,
                                [d.id]: {
                                  ...m.dishes[d.id]!,
                                  modifierGroups: m.dishes[d.id]!.modifierGroups.map((gg) => ({
                                    ...gg,
                                    modifiers: gg.modifiers.map((mm) => (mm.id === mod.id ? { ...mm, isAvailable: val } : mm)),
                                  })),
                                },
                              },
                            }))
                          }
                        />
                      </div>
                    )),
                  )}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
