const DEV_DEFAULTS: Record<string, string> = {
  QR_SIGNING_SECRET: 'dev-qr-secret-change-me',
};

/** Обязательная переменная окружения; в dev — с безопасным для локали дефолтом. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV !== 'production' && DEV_DEFAULTS[name]) return DEV_DEFAULTS[name];
  throw new Error(`Не задана переменная окружения ${name}`);
}
