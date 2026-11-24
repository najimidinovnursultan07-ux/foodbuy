'use client';

import { useMemo, useState } from 'react';
import { formatSom, pickText, somToTyiyn, type AdminMenuDto, type DishInput, type ModifierGroupsInput } from '@qrmenu/shared';
import { useAdmin } from '@/lib/admin-api';
import { ErrorNote, LocalizedInput, Modal, Toggle, toDraft, type LocalizedDraft } from './fields';
import s from './admin.module.css';

type OptionDraft = { id?: string; name: LocalizedDraft; price: string; isDefault: boolean; isAvailable: boolean };
type GroupDraft = { id?: string; name: LocalizedDraft; minSelect: number; maxSelect: number; modifiers: OptionDraft[] };

const somString = (tyiyn: number) => String(tyiyn / 100).replace('.', ',');
const parseSom = (v: string): number | null => {
  try {
    const n = somToTyiyn(v);
    return n >= 0 ? n : null;
  } catch {
    return null;
  }
};

export function DishEditor({
  menu,
  dishId,
  categoryId,
  onClose,
  onSaved,
}: {
  menu: AdminMenuDto;
  dishId?: string;
  categoryId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, locale, api, errorText } = useAdmin();
  const dish = dishId ? menu.dishes[dishId] : undefined;

  const [name, setName] = useState(toDraft(dish?.name));
  const [desc, setDesc] = useState(toDraft(dish?.description));
  const [cat, setCat] = useState(dish?.categoryId ?? categoryId);
  const [price, setPrice] = useState(dish ? somString(dish.priceTyiyn) : '');
  const [weight, setWeight] = useState(dish?.weightValue ? String(dish.weightValue) : '');
  const [unit, setUnit] = useState<'G' | 'ML' | 'PCS'>(dish?.weightUnit ?? 'G');
  const [station, setStation] = useState<'KITCHEN' | 'BAR'>(dish?.station ?? 'KITCHEN');
  const [flags, setFlags] = useState({
    isHit: dish?.isHit ?? false,
    isSpicy: dish?.isSpicy ?? false,
    isHalal: dish?.isHalal ?? false,
    isAvailable: dish?.isAvailable ?? true,
    isActive: dish?.isActive ?? true,
  });
  const [groups, setGroups] = useState<GroupDraft[]>(
    (dish?.modifierGroups ?? []).map((g) => ({
      id: g.id,
      name: toDraft(g.name),
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      modifiers: g.modifiers.map((m) => ({ id: m.id, name: toDraft(m.name), price: somString(m.priceDeltaTyiyn), isDefault: m.isDefault, isAvailable: m.isAvailable })),
    })),
  );
  const [upsells, setUpsells] = useState<string[]>(dish?.upsellIds ?? []);
  const [photo, setPhoto] = useState({ url: dish?.photoThumbUrl ?? null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceTyiyn = parseSom(price);
  const weightValue = weight.trim() ? Number(weight) : null;
  const weightOk = weightValue === null || (Number.isInteger(weightValue) && weightValue > 0);
  const optionsOk = groups.every((g) => g.name.ru.trim() && g.modifiers.length && g.modifiers.every((m) => m.name.ru.trim() && parseSom(m.price || '0') !== null));
  const canSave = name.ru.trim() && priceTyiyn !== null && weightOk && optionsOk && !busy;

  const otherDishes = useMemo(
    () =>
      menu.categories.flatMap((c) =>
        c.dishIds.filter((id) => id !== dishId).map((id) => ({ id, label: pickText(menu.dishes[id]!.name, locale), cat: pickText(c.name, locale) })),
      ),
    [menu, dishId, locale],
  );

  const setGroup = (i: number, patch: Partial<GroupDraft>) => setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const setOption = (gi: number, oi: number, patch: Partial<OptionDraft>) =>
    setGroup(gi, { modifiers: groups[gi]!.modifiers.map((m, j) => (j === oi ? { ...m, ...patch } : m)) });

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const body: DishInput = {
        categoryId: cat,
        name: name,
        description: desc.ru.trim() ? desc : null,
        priceTyiyn: priceTyiyn!,
        weightValue,
        weightUnit: weightValue === null ? null : unit,
        station,
        ...flags,
      };
      const id = dishId ?? (await api.send<{ id: string }>('POST', '/admin/dishes', body)).id;
      if (dishId) await api.send('PATCH', `/admin/dishes/${dishId}`, body);
      const mods: ModifierGroupsInput = {
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, priceDeltaTyiyn: parseSom(m.price || '0')!, isDefault: m.isDefault, isAvailable: m.isAvailable })),
        })),
      };
      await api.send('PUT', `/admin/dishes/${id}/modifiers`, mods);
      await api.send('PUT', `/admin/dishes/${id}/upsells`, { dishIds: upsells });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
      await onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !dishId) return;
    setBusy(true);
    try {
      const res = await api.upload<{ photoThumbUrl: string }>(`/admin/dishes/${dishId}/photo`, file);
      setPhoto({ url: res.photoThumbUrl });
      setError(null);
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={dish ? pickText(dish.name, locale) : t.newDish}
      onClose={onClose}
      footer={
        <>
          {dishId && (
            <button
              type="button"
              className={s.danger}
              disabled={busy}
              onClick={async () => {
                if (!confirm(t.confirmDelete)) return;
                try {
                  await api.send('DELETE', `/admin/dishes/${dishId}`);
                  await onSaved();
                  onClose();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              {t.delete}
            </button>
          )}
          <span className={s.spacer} />
          <button type="button" className={s.btn} onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className={s.primary} disabled={!canSave} onClick={save}>
            {busy ? t.saving : t.save}
          </button>
        </>
      }
    >
      <p className={s.muted}>{t.translationsHint}</p>
      <LocalizedInput label={t.name} value={name} onChange={setName} required />
      <LocalizedInput label={t.description} value={desc} onChange={setDesc} multiline maxLength={500} />

      <div className={s.grid}>
        <label className={s.field}>
          {t.category}
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {menu.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {pickText(c.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          {t.price}
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={price !== '' && priceTyiyn === null} required />
        </label>
        <label className={s.field}>
          {t.weight}
          <span className={s.inline}>
            <input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, ''))} aria-invalid={!weightOk} />
            <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label={t.weight}>
              {(['G', 'ML', 'PCS'] as const).map((u) => (
                <option key={u} value={u}>
                  {t.unit[u]}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className={s.field}>
          {t.station}
          <select value={station} onChange={(e) => setStation(e.target.value as typeof station)}>
            <option value="KITCHEN">{t.stations.KITCHEN}</option>
            <option value="BAR">{t.stations.BAR}</option>
          </select>
        </label>
      </div>

      <fieldset className={s.fieldset}>
        <legend>{t.tags}</legend>
        <div className={s.toggles}>
          <Toggle label={t.hit} checked={flags.isHit} onChange={(v) => setFlags({ ...flags, isHit: v })} />
          <Toggle label={t.spicy} checked={flags.isSpicy} onChange={(v) => setFlags({ ...flags, isSpicy: v })} />
          <Toggle label={t.halal} checked={flags.isHalal} onChange={(v) => setFlags({ ...flags, isHalal: v })} />
          <Toggle label={t.available} checked={flags.isAvailable} onChange={(v) => setFlags({ ...flags, isAvailable: v })} />
          <Toggle label={t.visible} checked={flags.isActive} onChange={(v) => setFlags({ ...flags, isActive: v })} />
        </div>
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend>{t.photo}</legend>
        {dishId ? (
          <div className={s.inline}>
            {photo.url && <img src={photo.url} alt="" width={88} height={88} className={s.thumb} />}
            <label className={s.btn}>
              {photo.url ? t.replacePhoto : t.uploadPhoto}
              <input type="file" accept="image/*" className={s.fileInput} onChange={(e) => uploadPhoto(e.target.files?.[0])} disabled={busy} />
            </label>
            {photo.url && (
              <button
                type="button"
                className={s.btn}
                onClick={async () => {
                  await api.send('DELETE', `/admin/dishes/${dishId}/photo`);
                  setPhoto({ url: null });
                  await onSaved();
                }}
              >
                {t.removePhoto}
              </button>
            )}
          </div>
        ) : (
          <p className={s.muted}>{t.photoAfterSave}</p>
        )}
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend>{t.modifiers}</legend>
        <p className={s.muted}>{t.groupHint}</p>
        {groups.map((g, gi) => (
          <div key={g.id ?? `new-${gi}`} className={s.group} data-testid="modifier-group">
            <LocalizedInput label={t.groupName} value={g.name} onChange={(v) => setGroup(gi, { name: v })} required />
            <div className={s.inline}>
              <label className={s.field}>
                {t.minSelect}
                <input type="number" min={0} max={g.maxSelect} value={g.minSelect} onChange={(e) => setGroup(gi, { minSelect: Number(e.target.value) })} />
              </label>
              <label className={s.field}>
                {t.maxSelect}
                <input type="number" min={1} max={20} value={g.maxSelect} onChange={(e) => setGroup(gi, { maxSelect: Math.max(1, Number(e.target.value)) })} />
              </label>
              <button type="button" className={s.btn} onClick={() => setGroups(groups.filter((_, j) => j !== gi))}>
                {t.removeGroup}
              </button>
            </div>
            {g.modifiers.map((m, oi) => (
              <div key={m.id ?? `new-${oi}`} className={s.option}>
                <LocalizedInput label={t.optionName} value={m.name} onChange={(v) => setOption(gi, oi, { name: v })} required />
                <div className={s.inline}>
                  <label className={s.field}>
                    {t.priceDelta}
                    <input inputMode="decimal" value={m.price} onChange={(e) => setOption(gi, oi, { price: e.target.value })} />
                  </label>
                  <Toggle label={t.isDefault} checked={m.isDefault} onChange={(v) => setOption(gi, oi, { isDefault: v })} />
                  <Toggle label={t.available} checked={m.isAvailable} onChange={(v) => setOption(gi, oi, { isAvailable: v })} />
                  <button
                    type="button"
                    className={s.iconBtn}
                    aria-label={t.delete}
                    onClick={() => setGroup(gi, { modifiers: g.modifiers.filter((_, j) => j !== oi) })}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className={s.btn}
              onClick={() => setGroup(gi, { modifiers: [...g.modifiers, { name: toDraft(null), price: '0', isDefault: false, isAvailable: true }] })}
            >
              + {t.addOption}
            </button>
          </div>
        ))}
        <button
          type="button"
          className={s.btn}
          onClick={() =>
            setGroups([...groups, { name: toDraft(null), minSelect: 1, maxSelect: 1, modifiers: [{ name: toDraft(null), price: '0', isDefault: true, isAvailable: true }] }])
          }
        >
          + {t.addGroup}
        </button>
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend>{t.upsells}</legend>
        <p className={s.muted}>{t.upsellsHint}</p>
        <div className={s.checklist}>
          {otherDishes.map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                checked={upsells.includes(d.id)}
                disabled={!upsells.includes(d.id) && upsells.length >= 10}
                onChange={(e) => setUpsells(e.target.checked ? [...upsells, d.id] : upsells.filter((x) => x !== d.id))}
              />
              {d.label} <span className={s.muted}>· {d.cat} · {formatSom(menu.dishes[d.id]!.priceTyiyn)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <ErrorNote text={error} />
    </Modal>
  );
}
