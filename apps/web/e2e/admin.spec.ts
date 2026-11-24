import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@qrmenu/db';

// Менеджер демо-ресторана наполняет меню, ставит стоп-лист, добавляет столы, сотрудника и меняет настройки.
// Всё созданное тестом удаляется; общие настройки (цвет) восстанавливаются.
const prisma = new PrismaClient();
const NEW_PHONE = '+996555300001';
// 1×1 PNG — сервер сам масштабирует до 960×720 и 176×176
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

async function cleanup() {
  const r = await prisma.restaurant.findUniqueOrThrow({ where: { slug: 'ala-too-demo' } });
  await prisma.category.deleteMany({ where: { restaurantId: r.id, name: { path: ['ru'], equals: 'Десерты' } } });
  await prisma.table.deleteMany({ where: { restaurantId: r.id, label: { in: ['20', '21'] } } });
  await prisma.staff.deleteMany({ where: { restaurantId: r.id, phone: NEW_PHONE } });
  await prisma.restaurant.update({ where: { id: r.id }, data: { accentColor: '#C2410C' } });
}
test.beforeAll(cleanup);
test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function login(page: Page, phone: string, pin: string) {
  await page.goto('/staff');
  await page.getByLabel('Телефон').fill(phone);
  await page.getByLabel('PIN-код').fill(pin);
  await page.getByRole('button', { name: 'Войти' }).click();
}

test('менеджер: меню → фото → стоп-лист → гость видит изменения; столы, PDF, сотрудник, настройки, отчёты', async ({ page, browser }) => {
  await login(page, '+996700000001', '1234');
  await expect(page).toHaveURL(/\/admin\/menu$/);

  // Категория на двух языках
  await page.getByRole('button', { name: '+ Добавить категорию' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название категории (RU)').fill('Десерты');
  await dialog.getByLabel('Название категории (KY)').fill('Таттуулар');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  const category = page.getByTestId('category').filter({ hasText: 'Десерты' });
  await expect(category).toContainText('В категории пока нет блюд');

  // Блюдо с вариантами
  await category.getByRole('button', { name: '+ Добавить блюдо' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название (RU)').fill('Чак-чак');
  await dialog.getByLabel('Название (KY)').fill('Чак-чак');
  await dialog.getByLabel('Цена, сом').fill('180');
  await dialog.getByLabel('Хит').check();
  await dialog.getByRole('button', { name: '+ Добавить группу' }).click();
  await dialog.getByLabel('Название группы (например, «Порция») (RU)').fill('Порция');
  await dialog.getByLabel('Вариант (RU)').fill('Маленькая');
  await dialog.getByRole('button', { name: '+ Добавить вариант' }).click();
  await dialog.getByLabel('Вариант (RU)').nth(1).fill('Большая');
  await dialog.getByLabel('+ сом').nth(1).fill('70');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = category.getByTestId('dish-row').filter({ hasText: 'Чак-чак' });
  await expect(row).toContainText(/180\sсом/);

  // Фото — после сохранения
  await row.getByRole('button', { name: 'Изменить' }).click();
  dialog = page.getByRole('dialog', { name: 'Чак-чак' });
  await dialog.locator('input[type=file]').setInputFiles({ name: 'chak.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByRole('button', { name: 'Удалить фото' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(row.locator('img')).toHaveAttribute('src', /_t\.webp$/);

  // Гость видит новое блюдо (на кыргызском — категория «Таттуулар»)
  const tables = await (await page.request.get('http://localhost:4000/admin/tables', {
    headers: { authorization: `Bearer ${await page.evaluate(() => JSON.parse(localStorage.getItem('qrmenu:staff')!).token)}` },
  })).json();
  const guest = await (await browser.newContext()).newPage();
  await guest.context().addCookies([{ name: 'lang', value: 'ky', url: 'http://localhost:3000' }]);
  await guest.goto(new URL(tables[0].url).pathname);
  await expect(guest.getByRole('link', { name: 'Таттуулар' })).toBeVisible();
  const guestDish = guest.getByTestId('dish').filter({ hasText: 'Чак-чак' });
  await expect(guestDish).toContainText('Хит');
  await guestDish.click();
  await guest.getByRole('dialog').getByLabel('Большая').check();
  await expect(guest.getByRole('dialog').getByRole('button', { name: /Кошуу/ })).toContainText(/250\sсом/);

  // Стоп-лист
  await page.getByRole('link', { name: 'Стоп-лист' }).click();
  const stop = page.getByTestId('stop-row').filter({ hasText: 'Чак-чак' });
  await stop.getByRole('switch', { name: 'Чак-чак' }).uncheck();
  await page.getByLabel('Только в стоп-листе').check();
  await expect(page.getByTestId('stop-row').filter({ hasText: 'Чак-чак' })).toBeVisible();
  await guest.reload();
  await expect(guest.getByTestId('dish').filter({ hasText: 'Чак-чак' })).toContainText('Азыр жок');

  // Столы и PDF
  await page.getByRole('link', { name: 'Столы и QR' }).click();
  await page.getByLabel('Номера столов').fill('20-21');
  await page.getByRole('button', { name: 'Добавить столы' }).click();
  await expect(page.getByTestId('table-row').filter({ hasText: 'Стол 21' })).toBeVisible();
  await page.getByLabel('Выбрать: Стол 20').check();
  await page.getByLabel('Выбрать: Стол 21').check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF выбранных (2)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('qr-tables.pdf');
  const pdf = await file.createReadStream().then(async (s) => {
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  // Сотрудник: добавить и войти под ним
  await page.getByRole('link', { name: 'Сотрудники' }).click();
  await page.getByRole('button', { name: '+ Добавить сотрудника' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Имя').fill('Тест Официант');
  await dialog.getByLabel('Телефон').fill('0555 300 001');
  await dialog.getByLabel('PIN для входа (4–6 цифр)').fill('5555');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('staff-row').filter({ hasText: 'Тест Официант' })).toContainText('+996555300001 · Официант');
  const waiter = await (await browser.newContext()).newPage();
  await login(waiter, NEW_PHONE, '5555');
  await expect(waiter).toHaveURL(/\/staff\/waiter/);

  // Настройки: цвет; неверная ссылка 2GIS не сохраняется
  await page.getByRole('link', { name: 'Настройки' }).click();
  await page.getByLabel('Акцентный цвет (HEX)').fill('#0F766E');
  await page.getByLabel('Ссылка на ресторан в 2GIS').fill('https://example.com/');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Проверьте заполнение полей.')).toBeVisible();
  await page.getByLabel('Ссылка на ресторан в 2GIS').fill('https://2gis.kg/bishkek');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  expect((await prisma.restaurant.findUniqueOrThrow({ where: { slug: 'ala-too-demo' } })).accentColor).toBe('#0F766E');
  // В тестовом окружении токена бота нет — панель честно об этом говорит
  await expect(page.getByTestId('telegram')).toContainText('Бот на платформе ещё не настроен');

  // Отчёты открываются, пресеты переключают период
  await page.getByRole('link', { name: 'Отчёты' }).click();
  await expect(page.getByTestId('revenue')).toBeVisible();
  await page.getByRole('button', { name: '30 дней' }).click();
  await expect(page.getByRole('button', { name: '30 дней' })).toHaveAttribute('aria-pressed', 'true');

  // Официант в панель не попадает
  await waiter.goto('/admin/menu');
  await expect(waiter).toHaveURL(/\/staff/);
});
