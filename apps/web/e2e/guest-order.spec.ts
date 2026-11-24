import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken } from '@qrmenu/shared/server';

// Заказ, счёт и вызовы на столе 4 демо-ресторана. Перед тестом счёт стола очищается.
const prisma = new PrismaClient();
const secret = process.env.QR_SIGNING_SECRET ?? 'dev-qr-secret-change-me';
let tableUrl: string;

test.beforeAll(async () => {
  const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: 'ala-too-demo' }, label: '4' } });
  await prisma.tableBill.deleteMany({ where: { tableId: table.id } });
  await prisma.waiterCall.deleteMany({ where: { tableId: table.id } });
  tableUrl = `/m/ala-too-demo/${createTableToken(table.id, table.tokenVersion, secret)}`;
});
test.afterAll(() => prisma.$disconnect());

const dish = (page: Page, name: string) => page.getByTestId('dish').filter({ hasText: name });
const som = (s: string) => new RegExp(s.replace(/ /g, '\\s'));

async function addToCart(page: Page, name: string, option?: string) {
  await dish(page, name).click();
  const sheet = page.getByRole('dialog', { name });
  if (option) await sheet.getByLabel(option).check();
  await sheet.getByRole('button', { name: /Добавить/ }).click();
  await expect(sheet).toHaveCount(0);
}

test('заказ из корзины, дозаказ в тот же счёт, второй телефон видит всё вживую, просьба принести счёт', async ({ browser }) => {
  const phoneA = await (await browser.newContext({ ...test.info().project.use })).newPage();
  const phoneB = await (await browser.newContext({ ...test.info().project.use })).newPage();

  // Телефон A: корзина
  await phoneA.goto(tableUrl);
  await addToCart(phoneA, 'Лагман', 'Большая');
  await phoneA.getByTestId('cart-bar').click();
  await expect(phoneA).toHaveURL(/\?view=cart/);
  await expect(phoneA.getByRole('heading', { name: 'Корзина' })).toBeVisible();
  const line = phoneA.getByTestId('cart-line');
  await expect(line).toContainText('Лагман');
  await expect(line).toContainText('Большая');
  await line.getByRole('button', { name: 'Больше' }).click();
  await expect(line).toContainText(som('800 сом'));
  await expect(phoneA.getByText('В счёт добавится обслуживание 10%')).toBeVisible();

  // «К этому берут» в корзине: добавляем лепёшку прямо отсюда
  const upsells = phoneA.getByRole('region', { name: 'К этому берут' });
  await expect(upsells.getByRole('button')).toHaveText([/Лепёшка/, /Чай/, /Салат «Ачичук»/]);
  await upsells.getByRole('button', { name: /Лепёшка/ }).click();
  await phoneA.getByRole('dialog', { name: 'Лепёшка' }).getByRole('button', { name: /Добавить/ }).click();
  await expect(phoneA.getByTestId('cart-line')).toHaveCount(2);

  await phoneA.getByRole('button', { name: /Отправить заказ · 840\sсом/ }).click();
  await expect(phoneA).toHaveURL(/\?view=bill/);
  await expect(phoneA.getByRole('status').filter({ hasText: 'Заказ отправлен' })).toBeVisible();
  await expect(phoneA.getByTestId('order')).toHaveCount(1);
  await expect(phoneA.getByTestId('order')).toContainText('Принят');
  await expect(phoneA.getByTestId('totals')).toContainText(som('924 сом')); // 840 + 10%

  // Телефон B за тем же столом видит счёт
  await phoneB.goto(tableUrl);
  await phoneB.getByTestId('bill-link').click();
  await expect(phoneB.getByTestId('order')).toHaveCount(1);

  // Дозаказ с телефона A — у B появляется без перезагрузки (WebSocket)
  await phoneA.getByRole('button', { name: 'Дозаказать' }).click();
  await addToCart(phoneA, 'Чай');
  await phoneA.getByTestId('cart-bar').click();
  await phoneA.getByRole('button', { name: /Отправить заказ/ }).click();
  await expect(phoneA.getByTestId('order')).toHaveCount(2);
  await expect(phoneB.getByTestId('order')).toHaveCount(2);
  await expect(phoneB.getByTestId('totals')).toContainText(som('1 034 сом')); // (840 + 100) + 10%

  // B просит счёт картой — A тоже видит
  await phoneB.getByRole('button', { name: 'Карта' }).click();
  await expect(phoneB.getByText('Счёт несут · Карта').first()).toBeVisible();
  await expect(phoneA.getByText('Счёт несут · Карта').first()).toBeVisible();
  await expect(phoneA.getByRole('button', { name: 'Карта' })).toHaveAttribute('aria-pressed', 'true');

  // «Позвать официанта» из меню: повторно нажать нельзя, пока вызов открыт
  await phoneA.getByRole('button', { name: '← Назад в меню' }).click();
  await phoneA.getByRole('button', { name: /Позвать официанта/ }).click();
  await expect(phoneA.getByRole('button', { name: /Официант скоро подойдёт/ })).toBeDisabled();
  await expect(phoneA.getByTestId('bill-link')).toContainText('Мой счёт · Принят');

  const calls = await prisma.waiterCall.findMany({ where: { table: { label: '4', restaurant: { slug: 'ala-too-demo' } } } });
  expect(calls.map((c) => [c.type, c.paymentMethod]).sort()).toEqual([
    ['BRING_BILL', 'CARD'],
    ['CALL_WAITER', null],
  ]);
});

test('кнопка «назад» браузера возвращает из корзины в меню', async ({ page }) => {
  await page.goto(tableUrl);
  await addToCart(page, 'Самса');
  await page.getByTestId('cart-bar').click();
  await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
  await page.goBack();
  await expect(dish(page, 'Самса')).toBeVisible();
  await expect(page.getByTestId('cart-bar')).toBeVisible();
});
