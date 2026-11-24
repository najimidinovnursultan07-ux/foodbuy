import { formatSom } from '@qrmenu/shared';

// Заглушка. Маршруты появятся по шагам: /t/[token] — гость, /waiter, /kitchen, /admin.
export default function Home() {
  return (
    <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <h1>QR-меню</h1>
      <p style={{ color: 'var(--muted)' }}>Каркас приложения. Пример цены: {formatSom(125000)}</p>
    </main>
  );
}
