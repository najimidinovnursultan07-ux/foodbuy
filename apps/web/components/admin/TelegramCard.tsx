'use client';

import { useState } from 'react';
import type { TelegramStatusDto } from '@qrmenu/shared';
import { useAdmin, useAdminData } from '@/lib/admin-api';
import { ErrorNote } from './fields';
import s from './admin.module.css';

/** Подключение Telegram владельца: одноразовая ссылка t.me/<бот>?start=<код>. */
export function TelegramCard() {
  const { t, api, errorText } = useAdmin();
  const { data, reload } = useAdminData<TelegramStatusDto>('/admin/telegram');
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (!data) return null;
  return (
    <fieldset className={s.fieldset} data-testid="telegram">
      <legend>{t.telegram}</legend>
      <p className={s.muted}>{t.tgWhat}</p>
      {!data.available ? (
        <p className={s.muted}>{t.tgUnavailable}</p>
      ) : (
        <>
          <p>
            <strong className={data.connected ? s.okText : undefined}>{data.connected ? t.tgConnected : t.tgNotConnected}</strong>
          </p>
          <div className={s.inline}>
            {!data.connected && (
              <button type="button" className={s.primary} onClick={() => run(async () => setLink((await api.send<{ url: string }>('POST', '/admin/telegram/link')).url))}>
                {t.tgConnect}
              </button>
            )}
            {data.connected && (
              <>
                <button
                  type="button"
                  className={s.btn}
                  onClick={() =>
                    run(async () => {
                      await api.send('POST', '/admin/telegram/test');
                      setNote(t.tgTestSent);
                    })
                  }
                >
                  {t.tgTest}
                </button>
                <button
                  type="button"
                  className={s.btn}
                  onClick={() =>
                    run(async () => {
                      await api.send('DELETE', '/admin/telegram');
                      setNote(null);
                      await reload();
                    })
                  }
                >
                  {t.tgDisconnect}
                </button>
              </>
            )}
          </div>
          {link && !data.connected && (
            <div className={s.tgLink}>
              <p className={s.muted}>{t.tgLinkHint}</p>
              <div className={s.inline}>
                <a className={s.primary} href={link} target="_blank" rel="noopener noreferrer">
                  {t.tgOpen}
                </a>
                <button type="button" className={s.btn} onClick={() => run(reload)}>
                  {t.tgCheck}
                </button>
              </div>
              <code className={s.code}>{link}</code>
            </div>
          )}
          {note && (
            <p className={s.okText} role="status">
              {note}
            </p>
          )}
        </>
      )}
      <ErrorNote text={error} />
    </fieldset>
  );
}
