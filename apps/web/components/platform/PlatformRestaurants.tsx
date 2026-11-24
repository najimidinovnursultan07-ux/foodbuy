'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  bishkekDate,
  formatSom,
  somToTyiyn,
  type CreateRestaurantRequest,
  type PlanDto,
  type PlatformRestaurantDto,
  type RestaurantStatusDto,
  type SubscriptionStatusDto,
} from '@qrmenu/shared';
import { usePlatform } from '@/lib/platform-api';
import type { PlatformMessages } from '@/lib/platform-i18n';
import { LangSwitch } from '@/components/staff/StaffHeader';
import { ErrorNote, Modal } from '@/components/admin/fields';
import s from '@/components/admin/admin.module.css';

type Platform = ReturnType<typeof usePlatform>;

export function PlatformRestaurants() {
  const p = usePlatform();
  const { t, session, locale, setLocale, logout, api } = p;
  const [list, setList] = useState<PlatformRestaurantDto[] | null>(null);
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [query, setQuery] = useState('');
  const [onlyExpired, setOnlyExpired] = useState(false);
  const [editing, setEditing] = useState<PlatformRestaurantDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [r, pl] = await Promise.all([api.get<PlatformRestaurantDto[]>('/platform/restaurants'), api.get<PlanDto[]>('/platform/plans')]);
      setList(r);
      setPlans(pl);
      setError(null);
    } catch (e) {
      setError(p.errorText(e));
    }
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (session) void reload();
  }, [session, reload]);

  if (!session) return null;
  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (r) => (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) && (!onlyExpired || r.subscription?.expired),
  );

  return (
    <div className={s.shell}>
      <header className={s.top}>
        <div className={s.brand}>
          <strong>{t.title}</strong>
          <span>{session.admin.name}</span>
        </div>
        <div className={s.topTools}>
          <LangSwitch locale={locale} onChange={setLocale} label={t.language} />
          <button type="button" className={s.btn} onClick={logout}>
            {t.logout}
          </button>
        </div>
      </header>
      <main className={s.main}>
        <div className={s.pageHead}>
          <h1>{t.restaurants}</h1>
          <button type="button" className={s.primary} onClick={() => setCreating(true)}>
            + {t.addRestaurant}
          </button>
        </div>
        <div className={s.inline}>
          <input type="search" className={s.search} placeholder={t.search} aria-label={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className={s.toggle}>
            <input type="checkbox" checked={onlyExpired} onChange={(e) => setOnlyExpired(e.target.checked)} />
            {t.onlyExpired}
          </label>
        </div>
        <ErrorNote text={error} />

        <ul className={`${s.card} ${s.rows}`}>
          {shown.map((r) => (
            <li key={r.id} className={s.row} data-testid="restaurant-row" data-inactive={r.status === 'DISABLED' || undefined}>
              <div className={s.rowMain}>
                <strong>
                  {r.name} <span className={s.muted}>· {r.slug}</span>
                </strong>
                <span>
                  <span className={r.status === 'ACTIVE' ? s.badgeOk : s.badge}>{t.status[r.status]}</span>
                  {r.subscription ? (
                    <span className={r.subscription.expired ? s.badgeWarn : s.badge}>
                      {r.subscription.planName} · {t.subStatus[r.subscription.status]} · {t.until} {r.subscription.periodEnd}
                      {r.subscription.expired && ` · ${t.expired}`}
                    </span>
                  ) : (
                    <span className={s.badgeWarn}>{t.noSubscription}</span>
                  )}
                  {r.telegramConnected && <span className={s.badge}>{t.telegramOn}</span>}
                </span>
                <span className={s.muted}>
                  {r.tablesCount} {t.tables} · {r.staffCount} {t.staff} · {r.lastOrderAt ? `${t.lastOrder} ${bishkekDate(new Date(r.lastOrderAt))}` : t.never}
                </span>
              </div>
              <button type="button" className={s.btn} onClick={() => setEditing(r)}>
                {t.edit}
              </button>
            </li>
          ))}
        </ul>

        <Plans p={p} plans={plans} onChanged={reload} />
      </main>

      {editing && <EditModal p={p} r={editing} plans={plans} onClose={() => setEditing(null)} onSaved={reload} />}
      {creating && <CreateModal p={p} plans={plans} onClose={() => setCreating(false)} onSaved={reload} />}
    </div>
  );
}

function EditModal({ p, r, plans, onClose, onSaved }: { p: Platform; r: PlatformRestaurantDto; plans: PlanDto[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t, api, errorText } = p;
  const [status, setStatus] = useState<RestaurantStatusDto>(r.status);
  const [sub, setSub] = useState({
    planId: r.subscription?.planId ?? plans[0]?.id ?? '',
    status: (r.subscription?.status ?? 'ACTIVE') as SubscriptionStatusDto,
    periodEnd: r.subscription?.periodEnd ?? bishkekDate(),
    note: r.subscription?.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subChanged =
    !r.subscription ||
    sub.planId !== r.subscription.planId ||
    sub.status !== r.subscription.status ||
    sub.periodEnd !== r.subscription.periodEnd ||
    sub.note !== (r.subscription.note ?? '');

  async function save() {
    setBusy(true);
    try {
      if (status !== r.status) await api.send('PATCH', `/platform/restaurants/${r.id}`, { status });
      if (subChanged) await api.send('PUT', `/platform/restaurants/${r.id}/subscription`, { ...sub, note: sub.note || null });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={r.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className={s.primary} disabled={busy || !sub.planId} onClick={save}>
            {busy ? t.saving : t.save}
          </button>
        </>
      }
    >
      <fieldset className={s.fieldset}>
        <legend>{t.restaurantStatus}</legend>
        {(['ACTIVE', 'MENU_ONLY', 'DISABLED'] as const).map((st) => (
          <label key={st} className={s.radio}>
            <input type="radio" name="status" checked={status === st} onChange={() => setStatus(st)} />
            {t.status[st]}
          </label>
        ))}
        <p className={s.muted}>{t.statusHint}</p>
      </fieldset>
      <fieldset className={s.fieldset}>
        <legend>{t.subscription}</legend>
        <div className={s.grid}>
          <label className={s.field}>
            {t.plan}
            <select value={sub.planId} onChange={(e) => setSub({ ...sub, planId: e.target.value })}>
              {plans.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} · {formatSom(pl.priceTyiyn)}
                  {t.perMonth}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            {t.subscription}
            <select value={sub.status} onChange={(e) => setSub({ ...sub, status: e.target.value as SubscriptionStatusDto })} aria-label={t.subscription}>
              {(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED'] as const).map((st) => (
                <option key={st} value={st}>
                  {t.subStatus[st]}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            {t.paidUntil}
            <input type="date" value={sub.periodEnd} onChange={(e) => e.target.value && setSub({ ...sub, periodEnd: e.target.value })} />
          </label>
        </div>
        <label className={s.field}>
          {t.note}
          <input value={sub.note} maxLength={300} onChange={(e) => setSub({ ...sub, note: e.target.value })} />
        </label>
      </fieldset>
      <ErrorNote text={error} />
    </Modal>
  );
}

function CreateModal({ p, plans, onClose, onSaved }: { p: Platform; plans: PlanDto[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t, api, errorText } = p;
  const [d, setD] = useState<CreateRestaurantRequest>({
    name: '',
    slug: '',
    managerName: '',
    managerPhone: '+996 ',
    managerPin: '',
    planId: plans[0]?.id ?? '',
    trialDays: 14,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugOk = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(d.slug);
  const ok = d.name.trim() && slugOk && d.managerName.trim() && /^\d{4,6}$/.test(d.managerPin) && d.planId && !busy;

  async function save() {
    setBusy(true);
    try {
      await api.send('POST', '/platform/restaurants', d);
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t.addRestaurant}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className={s.primary} disabled={!ok} onClick={save}>
            {busy ? t.saving : t.save}
          </button>
        </>
      }
    >
      <div className={s.grid}>
        <label className={s.field}>
          {t.name}
          <input value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </label>
        <label className={s.field}>
          {t.slug}
          <input value={d.slug} maxLength={40} onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase() })} aria-invalid={d.slug !== '' && !slugOk} />
          <span className={s.muted}>{t.slugHint}</span>
        </label>
        <label className={s.field}>
          {t.managerName}
          <input value={d.managerName} maxLength={60} onChange={(e) => setD({ ...d, managerName: e.target.value })} />
        </label>
        <label className={s.field}>
          {t.managerPhone}
          <input type="tel" value={d.managerPhone} onChange={(e) => setD({ ...d, managerPhone: e.target.value })} />
        </label>
        <label className={s.field}>
          {t.managerPin}
          <input inputMode="numeric" maxLength={6} value={d.managerPin} onChange={(e) => setD({ ...d, managerPin: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className={s.field}>
          {t.plan}
          <select value={d.planId} onChange={(e) => setD({ ...d, planId: e.target.value })}>
            {plans.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          {t.trialDays}
          <input type="number" min={0} max={90} value={d.trialDays} onChange={(e) => setD({ ...d, trialDays: Number(e.target.value) })} />
        </label>
      </div>
      <ErrorNote text={error} />
    </Modal>
  );
}

function Plans({ p, plans, onChanged }: { p: Platform; plans: PlanDto[]; onChanged: () => Promise<void> }) {
  const { t, api, errorText } = p;
  const [draft, setDraft] = useState({ code: '', name: '', price: '', maxTables: '' });
  const [error, setError] = useState<string | null>(null);
  const price = (() => {
    try {
      return somToTyiyn(draft.price);
    } catch {
      return null;
    }
  })();
  const ok = /^[a-z0-9-]{2,30}$/.test(draft.code) && draft.name.trim() && price !== null && price >= 0;

  return (
    <section className={s.card}>
      <h2>{t.plans}</h2>
      <ul className={s.rows}>
        {plans.map((pl) => (
          <li key={pl.id} className={s.row}>
            <div className={s.rowMain}>
              <strong>
                {pl.name} <span className={s.muted}>· {pl.code}</span>
              </strong>
              <span className={s.muted}>
                {formatSom(pl.priceTyiyn)}
                {t.perMonth}
                {pl.maxTables ? ` · ${t.maxTables}: ${pl.maxTables}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <PlanForm t={t} draft={draft} setDraft={setDraft} />
      <button
        type="button"
        className={s.btn}
        disabled={!ok}
        onClick={async () => {
          try {
            await api.send('POST', '/platform/plans', {
              code: draft.code,
              name: draft.name.trim(),
              priceTyiyn: price,
              maxTables: draft.maxTables ? Number(draft.maxTables) : null,
              isActive: true,
            });
            setDraft({ code: '', name: '', price: '', maxTables: '' });
            setError(null);
            await onChanged();
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        + {t.addPlan}
      </button>
      <ErrorNote text={error} />
    </section>
  );
}

function PlanForm({
  t,
  draft,
  setDraft,
}: {
  t: PlatformMessages;
  draft: { code: string; name: string; price: string; maxTables: string };
  setDraft: (d: { code: string; name: string; price: string; maxTables: string }) => void;
}) {
  return (
    <div className={s.grid}>
      <label className={s.field}>
        {t.code}
        <input value={draft.code} maxLength={30} onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase() })} />
      </label>
      <label className={s.field}>
        {t.name}
        <input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label className={s.field}>
        {t.price}
        <input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
      </label>
      <label className={s.field}>
        {t.maxTables}
        <input inputMode="numeric" value={draft.maxTables} onChange={(e) => setDraft({ ...draft, maxTables: e.target.value.replace(/\D/g, '') })} />
      </label>
    </div>
  );
}
