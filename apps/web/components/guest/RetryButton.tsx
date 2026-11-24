'use client';

import s from './guest.module.css';

export function RetryButton({ label }: { label: string }) {
  return (
    <button type="button" className={s.primary} onClick={() => window.location.reload()}>
      {label}
    </button>
  );
}
