'use client';

import { useEffect, useState } from 'react';
import { textOnAccent, WEEKDAYS, type OpeningHours, type SettingsDto, type SettingsInput, type Weekday } from '@qrmenu/shared';
import { useAdmin, useAdminData } from '@/lib/admin-api';
import { ErrorNote } from './fields';
import { TelegramCard } from './TelegramCard';
import s from './admin.module.css';

type DayDraft = { open: boolean; from: string; to: string };
type HoursDraft = { always: boolean; days: Record<Weekday, DayDraft> };

function toHoursDraft(h: OpeningHours): HoursDraft {
  const always = Object.keys(h).length === 0;
  const days = Object.fromEntries(
    WEEKDAYS.map((d) => {
      const iv = h[d]?.[0];
      return [d, { open: always || !!iv, from: iv?.[0] ?? '10:00', to: iv?.[1] ?? '23:00' }];
    }),
  ) as Record<Weekday, DayDraft>;
  return { always, days };
}

function fromHoursDraft(d: HoursDraft): OpeningHours {
  if (d.always) return {};
  return Object.fromEntries(WEEKDAYS.map((w) => [w, d.days[w].open ? [[d.days[w].from, d.days[w].to]] : []]));
}

export function SettingsAdmin() {
  const { t, api, errorText } = useAdmin();
  const { data, error: loadError, setData } = useAdminData<SettingsDto>('/admin/settings');
  const [form, setForm] = useState<(Omit<SettingsInput, 'openingHours' | 'serviceFeeBp' | 'twoGisUrl'> & { fee: string; twoGis: string }) | null>(null);
  const [hours, setHours] = useState<HoursDraft | null>(null);
  const [status, setStatus] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || form) return;
    const { openingHours, serviceFeeBp, twoGisUrl, slug: _s, logoUrl: _l, ...rest } = data;
    setForm({ ...rest, fee: String(serviceFeeBp / 100).replace('.', ','), twoGis: twoGisUrl ?? '' });
    setHours(toHoursDraft(openingHours));
  }, [data, form]);

  if (!data || !form || !hours) return <p className={s.loading}>{loadError ?? t.loading}</p>;

  const feeBp = Math.round(Number(form.fee.replace(',', '.')) * 100);
  const feeOk = Number.isFinite(feeBp) && feeBp >= 0 && feeBp <= 3000;
  const hoursOk = hours.always || WEEKDAYS.every((w) => !hours.days[w].open || hours.days[w].from !== hours.days[w].to);
  const canSave = form.name.trim() && feeOk && hoursOk && /^#[0-9a-fA-F]{6}$/.test(form.accentColor) && !busy;

  async function save() {
    setBusy(true);
    try {
      const { fee, twoGis, ...rest } = form!;
      const body: SettingsInput = { ...rest, serviceFeeBp: feeBp, twoGisUrl: twoGis.trim() || null, openingHours: fromHoursDraft(hours!) };
      setData(await api.send<SettingsDto>('PUT', '/admin/settings', body));
      setStatus({ ok: true });
    } catch (e) {
      setStatus({ error: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function logo(file?: File) {
    try {
      if (file) {
        const { logoUrl } = await api.upload<{ logoUrl: string }>('/admin/settings/logo', file);
        setData({ ...data!, logoUrl });
      } else {
        await api.send('DELETE', '/admin/settings/logo');
        setData({ ...data!, logoUrl: null });
      }
      setStatus(null);
    } catch (e) {
      setStatus({ error: errorText(e) });
    }
  }

  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setStatus(null);
  };
  const setDay = (w: Weekday, patch: Partial<DayDraft>) => {
    setHours({ ...hours, days: { ...hours.days, [w]: { ...hours.days[w], ...patch } } });
    setStatus(null);
  };

  return (
    <section>
      <div className={s.pageHead}>
        <h1>{t.settingsTitle}</h1>
      </div>

      <div className={s.card}>
        <div className={s.grid}>
          <label className={s.field}>
            {t.restaurantName}
            <input value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} required />
          </label>
          <label className={s.field}>
            {t.defaultLanguage}
            <select value={form.defaultLocale} onChange={(e) => set({ defaultLocale: e.target.value as SettingsDto['defaultLocale'] })}>
              <option value="ru">Русский</option>
              <option value="ky">Кыргызча</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className={s.field}>
            {t.serviceFee}
            <input inputMode="decimal" value={form.fee} onChange={(e) => set({ fee: e.target.value })} aria-invalid={!feeOk} />
          </label>
          <label className={s.field}>
            {t.alertMinutes}
            <input type="number" min={3} max={180} value={form.orderAlertMinutes} onChange={(e) => set({ orderAlertMinutes: Number(e.target.value) })} />
            <span className={s.muted}>{t.alertHint}</span>
          </label>
        </div>

        <fieldset className={s.fieldset}>
          <legend>{t.orderFlow}</legend>
          {(['DIRECT_TO_KITCHEN', 'WAITER_CONFIRM'] as const).map((f) => (
            <label key={f} className={s.radio}>
              <input type="radio" name="flow" checked={form.orderFlow === f} onChange={() => set({ orderFlow: f })} />
              {f === 'DIRECT_TO_KITCHEN' ? t.flowDirect : t.flowConfirm}
            </label>
          ))}
        </fieldset>

        <fieldset className={s.fieldset}>
          <legend>{t.logo}</legend>
          <div className={s.inline}>
            {data.logoUrl && <img src={data.logoUrl} alt="" width={64} height={64} className={s.thumb} />}
            <label className={s.btn}>
              {t.uploadLogo}
              <input type="file" accept="image/*" className={s.fileInput} onChange={(e) => logo(e.target.files?.[0])} />
            </label>
            {data.logoUrl && (
              <button type="button" className={s.btn} onClick={() => logo()}>
                {t.removeLogo}
              </button>
            )}
          </div>
        </fieldset>

        <fieldset className={s.fieldset}>
          <legend>{t.accent}</legend>
          <div className={s.inline}>
            <input type="color" value={form.accentColor} onChange={(e) => set({ accentColor: e.target.value })} aria-label={t.accent} className={s.color} />
            <input value={form.accentColor} maxLength={7} onChange={(e) => set({ accentColor: e.target.value })} aria-label={`${t.accent} (HEX)`} className={s.hex} />
            <span className={s.preview} style={{ background: form.accentColor, color: textOnAccent(form.accentColor) }}>
              {t.accentPreview}
            </span>
          </div>
        </fieldset>

        <label className={s.field}>
          {t.twoGis}
          <input type="url" placeholder="https://2gis.kg/bishkek/firm/…" value={form.twoGis} onChange={(e) => set({ twoGis: e.target.value })} />
          <span className={s.muted}>{t.twoGisHint}</span>
        </label>

        <label className={s.field}>
          {t.reportHour}
          <select value={form.reportHour} onChange={(e) => set({ reportHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>

        <TelegramCard />

        <fieldset className={s.fieldset}>
          <legend>{t.hours}</legend>
          <p className={s.muted}>{t.hoursHint}</p>
          <label className={s.radio}>
            <input type="checkbox" checked={hours.always} onChange={(e) => setHours({ ...hours, always: e.target.checked })} />
            {t.hoursAlways}
          </label>
          {!hours.always &&
            WEEKDAYS.map((w) => (
              <div key={w} className={s.dayRow}>
                <label className={s.radio}>
                  <input type="checkbox" checked={hours.days[w].open} onChange={(e) => setDay(w, { open: e.target.checked })} />
                  <span className={s.dayName}>{t.days[w]}</span>
                </label>
                {hours.days[w].open ? (
                  <>
                    <input type="time" value={hours.days[w].from} onChange={(e) => setDay(w, { from: e.target.value })} aria-label={`${t.days[w]} ${t.from}`} />
                    <span>—</span>
                    <input type="time" value={hours.days[w].to} onChange={(e) => setDay(w, { to: e.target.value })} aria-label={`${t.days[w]} ${t.to}`} />
                  </>
                ) : (
                  <span className={s.muted}>{t.dayOff}</span>
                )}
              </div>
            ))}
        </fieldset>

        {status?.error && <ErrorNote text={status.error} />}
        <div className={s.saveBar}>
          {status?.ok && (
            <span className={s.okText} role="status">
              ✓ {t.saved}
            </span>
          )}
          <button type="button" className={s.primary} disabled={!canSave} onClick={save}>
            {busy ? t.saving : t.save}
          </button>
        </div>
      </div>
    </section>
  );
}
