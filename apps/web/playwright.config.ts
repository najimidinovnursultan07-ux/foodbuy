import { defineConfig, devices } from '@playwright/test';

// Основной путь гостя. Требует Postgres/Redis, миграции и сиды (`pnpm db:seed`).
// Поднимает собранные api (:4000) и web (:3000) или переиспользует запущенные.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
  },
  projects: [{ name: 'android', use: { ...devices['Pixel 5'] } }],
  webServer: [
    {
      command: 'pnpm --filter @qrmenu/api exec dotenv -e ../../.env -- node dist/main.js',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      cwd: '../..',
    },
    {
      command: 'pnpm start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
    },
  ],
});
