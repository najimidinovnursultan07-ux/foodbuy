'use client';

import { useState } from 'react';
import { formatSom, pickText, type AdminCategoryDto, type AdminMenuDto } from '@qrmenu/shared';
import { useAdmin, useAdminData } from '@/lib/admin-api';
import { DishEditor } from './DishEditor';
import { ErrorNote, LocalizedInput, Modal, Toggle, toDraft, type LocalizedDraft } from './fields';
import s from './admin.module.css';

const move = <T,>(arr: T[], i: number, d: -1 | 1) => {
  const next = [...arr];
  [next[i], next[i + d]] = [next[i + d]!, next[i]!];
  return next;
};

export function MenuEditor() {
  const { t, locale, api, errorText } = useAdmin();
  const { data: menu, error: loadError, reload } = useAdminData<AdminMenuDto>('/admin/menu');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ dishId?: string; categoryId: string } | null>(null);
  const [catModal, setCatModal] = useState<{ id?: string; name: LocalizedDraft } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
    await reload();
  }

  if (!menu) return <p className={s.loading}>{loadError ?? t.loading}</p>;
  const catIds = menu.categories.map((c) => c.id);

  return (
    <section>
      <div className={s.pageHead}>
        <h1>{t.nav.menu}</h1>
        <button type="button" className={s.primary} onClick={() => setCatModal({ name: toDraft(null) })}>
          + {t.addCategory}
        </button>
      </div>
      <ErrorNote text={error} />

      {menu.categories.map((c, ci) => (
        <CategoryBlock
          key={c.id}
          category={c}
          menu={menu}
          first={ci === 0}
          last={ci === menu.categories.length - 1}
          onMove={(d) => run(() => api.send('POST', '/admin/categories/reorder', { ids: move(catIds, ci, d) }))}
          onRename={() => setCatModal({ id: c.id, name: toDraft(c.name) })}
          onToggle={() => run(() => api.send('PATCH', `/admin/categories/${c.id}`, { isActive: !c.isActive }))}
          onDelete={() => confirm(t.confirmDelete) && run(() => api.send('DELETE', `/admin/categories/${c.id}`))}
          onAddDish={() => setEditing({ categoryId: c.id })}
          onEditDish={(dishId) => setEditing({ dishId, categoryId: c.id })}
          onMoveDish={(i, d) => run(() => api.send('POST', '/admin/dishes/reorder', { categoryId: c.id, ids: move(c.dishIds, i, d) }))}
          onAvailability={(dishId, v) => run(() => api.send('PATCH', `/admin/dishes/${dishId}`, { isAvailable: v }))}
          t={t}
          locale={locale}
        />
      ))}

      {catModal && (
        <CategoryModal
          initial={catModal.name}
          title={catModal.id ? t.rename : t.addCategory}
          onClose={() => setCatModal(null)}
          onSave={async (name) => {
            if (catModal.id) await api.send('PATCH', `/admin/categories/${catModal.id}`, { name });
            else await api.send('POST', '/admin/categories', { name });
            setCatModal(null);
            await reload();
          }}
        />
      )}

      {editing && (
        <DishEditor
          key={editing.dishId ?? 'new'}
          menu={menu}
          dishId={editing.dishId}
          categoryId={editing.categoryId}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </section>
  );
}

function CategoryBlock(props: {
  category: AdminCategoryDto;
  menu: AdminMenuDto;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onRename: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onAddDish: () => void;
  onEditDish: (id: string) => void;
  onMoveDish: (i: number, d: -1 | 1) => void;
  onAvailability: (id: string, v: boolean) => void;
  t: ReturnType<typeof useAdmin>['t'];
  locale: ReturnType<typeof useAdmin>['locale'];
}) {
  const { category: c, menu, t, locale } = props;
  return (
    <article className={s.card} data-testid="category">
      <header className={s.cardHead}>
        <h2>
          {pickText(c.name, locale)} {!c.isActive && <span className={s.badge}>{t.hidden}</span>}
        </h2>
        <div className={s.actions}>
          <button type="button" className={s.iconBtn} disabled={props.first} onClick={() => props.onMove(-1)} aria-label={t.up}>
            ↑
          </button>
          <button type="button" className={s.iconBtn} disabled={props.last} onClick={() => props.onMove(1)} aria-label={t.down}>
            ↓
          </button>
          <button type="button" className={s.btn} onClick={props.onRename}>
            {t.rename}
          </button>
          <button type="button" className={s.btn} onClick={props.onToggle}>
            {c.isActive ? t.hide : t.show}
          </button>
          {c.dishIds.length === 0 && (
            <button type="button" className={s.btn} onClick={props.onDelete}>
              {t.delete}
            </button>
          )}
        </div>
      </header>

      {c.dishIds.length === 0 && <p className={s.muted}>{t.emptyCategory}</p>}
      <ul className={s.rows}>
        {c.dishIds.map((id, i) => {
          const d = menu.dishes[id]!;
          return (
            <li key={id} className={s.row} data-testid="dish-row">
              {d.photoThumbUrl ? <img src={d.photoThumbUrl} alt="" width={48} height={48} className={s.thumb} /> : <span className={s.thumbEmpty} />}
              <div className={s.rowMain}>
                <strong>{pickText(d.name, locale)}</strong>
                <span className={s.muted}>
                  {formatSom(d.priceTyiyn)}
                  {!d.isActive && <span className={s.badge}>{t.hidden}</span>}
                </span>
              </div>
              <Toggle label={t.available} checked={d.isAvailable} onChange={(v) => props.onAvailability(id, v)} />
              <div className={s.actions}>
                <button type="button" className={s.iconBtn} disabled={i === 0} onClick={() => props.onMoveDish(i, -1)} aria-label={t.up}>
                  ↑
                </button>
                <button type="button" className={s.iconBtn} disabled={i === c.dishIds.length - 1} onClick={() => props.onMoveDish(i, 1)} aria-label={t.down}>
                  ↓
                </button>
                <button type="button" className={s.btn} onClick={() => props.onEditDish(id)}>
                  {t.edit}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className={s.btn} onClick={props.onAddDish}>
        + {t.addDish}
      </button>
    </article>
  );
}

function CategoryModal({
  initial,
  title,
  onClose,
  onSave,
}: {
  initial: LocalizedDraft;
  title: string;
  onClose: () => void;
  onSave: (name: LocalizedDraft) => Promise<void>;
}) {
  const { t, errorText } = useAdmin();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className={s.primary}
            disabled={busy || !name.ru.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(name);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t.saving : t.save}
          </button>
        </>
      }
    >
      <LocalizedInput label={t.categoryName} value={name} onChange={setName} required />
      <ErrorNote text={error} />
    </Modal>
  );
}
