'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@qrmenu/shared';
import { messages } from '@/lib/i18n';
import { guestApi } from '@/lib/guest-api';
import s from './guest.module.css';

/**
 * Отзыв после закрытия счёта. 4–5★ — предлагаем 2GIS (если ресторан указал ссылку),
 * 1–3★ — благодарим: отзыв уходит только владельцу.
 */
export function ReviewSheet({
  slug,
  token,
  billId,
  locale,
  onDone,
}: {
  slug: string;
  token: string;
  billId: string;
  locale: Locale;
  onDone: () => void;
}) {
  const t = messages(locale);
  const ref = useRef<HTMLDialogElement>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<{ twoGisUrl: string | null } | null>(null);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  async function send() {
    setBusy(true);
    setError(false);
    try {
      setResult(await guestApi.createReview(slug, token, { billId, rating, comment: comment.trim() || undefined }));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className={s.sheet} aria-labelledby="review-title" onClose={onDone} data-testid="review">
      <div className={s.sheetBody}>
        <h2 id="review-title" className={s.sheetTitle}>
          {t.reviewTitle}
        </h2>
        {!result ? (
          <>
            <p className={s.sheetDesc}>{t.reviewAsk}</p>
            <div className={s.stars} role="radiogroup" aria-label={t.reviewAsk}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={t.stars(n)}
                  className={s.star}
                  data-on={n <= rating || undefined}
                  onClick={() => setRating(n)}
                >
                  ★
                </button>
              ))}
            </div>
            {rating > 0 && (
              <label className={s.commentLabel}>
                {rating <= 3 ? t.reviewCommentBad : t.reviewCommentGood}
                <textarea className={s.comment} rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
            )}
            {error && (
              <p className={s.error} role="alert">
                {t.errGeneric}
              </p>
            )}
          </>
        ) : (
          <p className={s.sheetDesc} role="status">
            {rating <= 3 ? t.thanksBad : result.twoGisUrl ? t.thanksGood : t.thanksPlain}
          </p>
        )}
      </div>
      <div className={s.sheetFooter}>
        {!result ? (
          <>
            <button type="button" className={s.secondary} onClick={onDone}>
              {t.skip}
            </button>
            <button type="button" className={s.primary} disabled={!rating || busy} onClick={send}>
              {t.sendReview}
            </button>
          </>
        ) : (
          <>
            {result.twoGisUrl && (
              <a className={s.primary} href={result.twoGisUrl} target="_blank" rel="noopener noreferrer" onClick={onDone}>
                {t.open2gis}
              </a>
            )}
            <button type="button" className={result.twoGisUrl ? s.secondary : s.primary} onClick={onDone}>
              {t.close}
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
