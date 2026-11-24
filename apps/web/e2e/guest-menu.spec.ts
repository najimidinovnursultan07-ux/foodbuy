import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken } from '@qrmenu/shared/server';

const prisma = new PrismaClient();
const secret = process.env.QR_SIGNING_SECRET ?? 'dev-qr-secret-change-me';
let tableUrl: string;

test.beforeAll(async () => {
  const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: 'ala-too-demo' }, label: '3' } });
  tableUrl = `/m/ala-too-demo/${createTableToken(table.id, table.tokenVersion, secret)}`;
});
test.afterAll(() => prisma.$disconnect());

const dish = (page: Page, name: string) => page.getByTestId('dish').filter({ hasText: name });

test('гость открывает меню, меняет язык, выбирает модификаторы и добавляет в корзину', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(tableUrl);

  await expect(page.getByRole('heading', { level: 1, name: 'Ала-Тоо' })).toBeVisible();
  await expect(page.getByText('Стол 3')).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Категории меню' }).getByRole('link');
  await expect(tabs).toHaveText(['Горячие блюда', 'Супы', 'Салаты и закуски', 'Напитки']);
  await expect(dish(page, 'Лагман')).toContainText('320 сом');
  await expect(dish(page, 'Лагман')).toContainText('450 г');

  // Язык: KY, сохраняется после перезагрузки
  await page.getByRole('button', { name: 'KY' }).click();
  await expect(page.getByText('Үстөл 3')).toBeVisible();
  await expect(dish(page, 'Палоо')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'KY' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dish(page, 'Палоо')).toBeVisible();
  await page.getByRole('button', { name: 'RU' }).click();

  // Карточка блюда: обязательная группа, цена с модификатором и количеством
  await dish(page, 'Лагман').click();
  const sheet = page.getByRole('dialog', { name: 'Лагман' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Стандартная')).toBeChecked();
  await sheet.getByLabel('Большая').check();
  await sheet.getByRole('button', { name: 'Больше' }).click();
  await sheet.getByLabel('Комментарий к блюду').fill('без лука');
  await expect(sheet.getByRole('button', { name: /Добавить/ })).toHaveText('Добавить · 800 сом'); // (320+80)×2

  // «К этому берут» открывает другое блюдо
  await expect(sheet.getByRole('heading', { name: 'К этому берут' })).toBeVisible();
  await sheet.getByRole('button', { name: /Лепёшка/ }).click();
  await expect(page.getByRole('dialog', { name: 'Лепёшка' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Добавить/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('cart-bar')).toHaveText(/Корзина · 1 позиция\s*40\sсом/);

  await dish(page, 'Лагман').click();
  await page.getByRole('dialog').getByLabel('Большая').check();
  await page.getByRole('dialog').getByRole('button', { name: /Добавить/ }).click();
  await expect(page.getByTestId('cart-bar')).toHaveText(/2 позиции\s*440\sсом/);

  // Корзина переживает перезагрузку
  await page.reload();
  await expect(page.getByTestId('cart-bar')).toHaveText(/2 позиции\s*440\sсом/);
});

test('блюдо из стоп-листа видно, но заказать нельзя', async ({ page }) => {
  await page.goto(tableUrl);
  await expect(dish(page, 'Бешбармак')).toContainText('Нет в наличии');
  await dish(page, 'Бешбармак').click();
  const sheet = page.getByRole('dialog', { name: 'Бешбармак' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Добавить/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('поддельная ссылка — понятная ошибка', async ({ page }) => {
  await page.goto(tableUrl.slice(0, -3) + 'xyz');
  await expect(page.getByRole('heading', { name: 'Ссылка недействительна' })).toBeVisible();
});

test('меню открывается ≤ 2 с на медленном Android (Fast 3G, CPU ×4)', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const started = Date.now();
  await page.goto(tableUrl, { waitUntil: 'commit' });
  await expect(dish(page, 'Лагман')).toBeVisible(); // контент приходит в SSR-HTML
  const contentMs = Date.now() - started;
  await page.waitForLoadState('load');
  const loadMs = Date.now() - started;
  console.log(`контент: ${contentMs} мс, load: ${loadMs} мс`);
  expect(contentMs).toBeLessThan(2000);
});
