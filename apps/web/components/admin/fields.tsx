'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { LocalizedText } from '@qrmenu/shared';
import s from './admin.module.css';

export type LocalizedDraft = { ru: string; ky: string; en: string };
export const toDraft = (t: LocalizedText | null | undefined): LocalizedDraft => ({ ru: t?.ru ?? '', ky: t?.ky ?? '', en: t?.en ?? '' });

/** Поле на трёх языках: RU обязательно, KY и EN — по желанию. */
export function LocalizedInput({
  label,
  value,
  onChange,
  multiline,
  required,
  maxLength = 120,
}: {
  label: string;
  value: LocalizedDraft;
  onChange: (v: LocalizedDraft) => void;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <fieldset className={s.l10n}>
      <legend>{label}</legend>
      {(['ru', 'ky', 'en'] as const).map((lang) => {
        const props = {
          lang,
          value: value[lang],
          maxLength,
          required: required && lang === 'ru',
          'aria-label': `${label} (${lang.toUpperCase()})`,
          onChange: (e: { target: { value: string } }) => onChange({ ...value, [lang]: e.target.value }),
        };
        return (
          <label key={lang} className={s.l10nRow}>
            <span className={s.langTag}>{lang.toUpperCase()}</span>
            {multiline ? <textarea rows={2} {...props} /> : <input type="text" {...props} />}
          </label>
        );
      })}
    </fieldset>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={s.toggle}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Модальное окно на <dialog>: фокус внутри, Esc закрывает. */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} className={s.modal} aria-label={title} onClose={onClose}>
      <header className={s.modalHead}>
        <h2>{title}</h2>
        <button type="button" className={s.iconBtn} onClick={onClose} aria-label="×">
          ×
        </button>
      </header>
      <div className={s.modalBody}>{children}</div>
      <footer className={s.modalFoot}>{footer}</footer>
    </dialog>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  return text ? (
    <p className={s.error} role="alert">
      {text}
    </p>
  ) : null;
}
