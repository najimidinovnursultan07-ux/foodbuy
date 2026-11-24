'use client';

import { useState } from 'react';
import type { AdminStaffDto, StaffInput } from '@qrmenu/shared';
import { useAdmin, useAdminData } from '@/lib/admin-api';
import { ErrorNote, Modal, Toggle } from './fields';
import s from './admin.module.css';

type Draft = StaffInput & { id?: string };
const EMPTY: Draft = { name: '', phone: '+996 ', role: 'waiter', station: null, isActive: true, pin: '' };

export function StaffAdmin() {
  const { t, session } = useAdmin();
  const { data: staff, error: loadError, reload } = useAdminData<AdminStaffDto[]>('/admin/staff');
  const [editing, setEditing] = useState<Draft | null>(null);

  if (!staff) return <p className={s.loading}>{loadError ?? t.loading}</p>;

  return (
    <section>
      <div className={s.pageHead}>
        <h1>{t.staffTitle}</h1>
        <button type="button" className={s.primary} onClick={() => setEditing({ ...EMPTY })}>
          + {t.addStaff}
        </button>
      </div>
      <p className={s.muted}>{t.staffHint}</p>
      <ul className={`${s.card} ${s.rows}`}>
        {staff.map((m) => (
          <li key={m.id} className={s.row} data-inactive={!m.isActive || undefined} data-testid="staff-row">
            <div className={s.rowMain}>
              <strong>
                {m.name} {m.id === session.staff.id && '★'}
              </strong>
              <span className={s.muted}>
                {m.phone} · {t.roles[m.role]}
                {m.role === 'kitchen' && ` · ${m.station ? t.stations[m.station] : t.allStations}`}
                {!m.isActive && <span className={s.badge}>{t.inactive}</span>}
              </span>
            </div>
            <button type="button" className={s.btn} onClick={() => setEditing({ ...m, pin: '' })}>
              {t.edit}
            </button>
          </li>
        ))}
      </ul>
      {editing && <StaffModal draft={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </section>
  );
}

function StaffModal({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t, api, errorText } = useAdmin();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinOk = d.id ? !d.pin || /^\d{4,6}$/.test(d.pin) : /^\d{4,6}$/.test(d.pin ?? '');
  const canSave = d.name.trim() && d.phone.replace(/\D/g, '').length >= 9 && pinOk && !busy;

  async function save() {
    setBusy(true);
    try {
      const { id, ...body } = d;
      const payload = { ...body, pin: body.pin || undefined, station: body.role === 'kitchen' ? body.station : null };
      if (id) await api.send('PUT', `/admin/staff/${id}`, payload);
      else await api.send('POST', '/admin/staff', payload);
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
      title={d.id ? d.name : t.addStaff}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className={s.primary} disabled={!canSave} onClick={save}>
            {busy ? t.saving : t.save}
          </button>
        </>
      }
    >
      <div className={s.grid}>
        <label className={s.field}>
          {t.staffName}
          <input value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </label>
        <label className={s.field}>
          {t.phone}
          <input type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} required />
        </label>
        <label className={s.field}>
          {t.role}
          <select value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as Draft['role'] })}>
            {(['waiter', 'kitchen', 'manager'] as const).map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </select>
        </label>
        {d.role === 'kitchen' && (
          <label className={s.field}>
            {t.station}
            <select value={d.station ?? ''} onChange={(e) => setD({ ...d, station: (e.target.value || null) as Draft['station'] })}>
              <option value="">{t.allStations}</option>
              <option value="KITCHEN">{t.stations.KITCHEN}</option>
              <option value="BAR">{t.stations.BAR}</option>
            </select>
          </label>
        )}
        <label className={s.field}>
          {d.id ? t.newPin : t.pin}
          <input
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={d.pin ?? ''}
            onChange={(e) => setD({ ...d, pin: e.target.value.replace(/\D/g, '') })}
            aria-invalid={!pinOk}
            required={!d.id}
          />
        </label>
      </div>
      <Toggle label={t.active} checked={d.isActive} onChange={(v) => setD({ ...d, isActive: v })} />
      <ErrorNote text={error} />
    </Modal>
  );
}
