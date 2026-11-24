import s from './guest.module.css';
import { RetryButton } from './RetryButton';

export function StatusScreen({ title, text, retry }: { title: string; text: string; retry?: string }) {
  return (
    <main className={s.status}>
      <h1>{title}</h1>
      <p>{text}</p>
      {retry && <RetryButton label={retry} />}
    </main>
  );
}
