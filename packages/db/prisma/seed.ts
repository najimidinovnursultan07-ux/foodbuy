/**
 * Сиды: демо-ресторан «Ала-Тоо» с меню на RU/KY/EN, столами, персоналом и подпиской.
 * Идемпотентно: демо-ресторан удаляется и создаётся заново (каскадом).
 *
 * Вход персонала (телефон / PIN):
 *   менеджер  +996700000001 / 1234
 *   официант  +996700000002 / 1111
 *   кухня     +996700000003 / 2222
 *   бар       +996700000004 / 3333
 *   платформа +996700000099 / 999999 (супер-админка /platform)
 */
import { PrismaClient, Station, WeightUnit } from '@prisma/client';
import { createTableToken, hashPin } from '@qrmenu/shared/server';
import { somToTyiyn, type LocalizedText } from '@qrmenu/shared';

const prisma = new PrismaClient();
export const DEMO_SLUG = 'ala-too-demo';

type DishSeed = {
  key: string;
  name: LocalizedText;
  description?: LocalizedText;
  priceSom: number;
  weight?: [number, WeightUnit];
  station?: Station;
  hit?: boolean;
  spicy?: boolean;
  halal?: boolean;
  available?: boolean;
  modifiers?: {
    name: LocalizedText;
    min: number;
    max: number;
    options: { name: LocalizedText; deltaSom?: number; isDefault?: boolean }[];
  }[];
};

const MENU: { name: LocalizedText; dishes: DishSeed[] }[] = [
  {
    name: { ru: 'Горячие блюда', ky: 'Ысык тамактар', en: 'Main courses' },
    dishes: [
      {
        key: 'lagman',
        name: { ru: 'Лагман', ky: 'Лагман', en: 'Lagman' },
        description: {
          ru: 'Тянутая лапша ручной работы, говядина, овощи',
          ky: 'Колдо созулган кесме, уй эти, жашылчалар',
          en: 'Hand-pulled noodles with beef and vegetables',
        },
        priceSom: 320,
        weight: [450, WeightUnit.G],
        hit: true,
        halal: true,
        modifiers: [
          {
            name: { ru: 'Порция', ky: 'Үлүш', en: 'Portion' },
            min: 1,
            max: 1,
            options: [
              { name: { ru: 'Стандартная', ky: 'Кадимки', en: 'Regular' }, isDefault: true },
              { name: { ru: 'Большая', ky: 'Чоң', en: 'Large' }, deltaSom: 80 },
            ],
          },
          {
            name: { ru: 'Острота', ky: 'Ачуулугу', en: 'Spiciness' },
            min: 0,
            max: 1,
            options: [
              { name: { ru: 'Без острого', ky: 'Ачуусуз', en: 'Not spicy' } },
              { name: { ru: 'Острый', ky: 'Ачуу', en: 'Spicy' } },
            ],
          },
        ],
      },
      {
        key: 'plov',
        name: { ru: 'Плов', ky: 'Палоо', en: 'Plov' },
        description: {
          ru: 'Рис девзира, баранина, морковь, нут',
          ky: 'Девзира күрүчү, кой эти, сабиз, нокот',
          en: 'Devzira rice, lamb, carrots, chickpeas',
        },
        priceSom: 350,
        weight: [400, WeightUnit.G],
        hit: true,
        halal: true,
      },
      {
        key: 'manty',
        name: { ru: 'Манты', ky: 'Манты', en: 'Manty dumplings' },
        description: { ru: 'С мясом и луком, 5 шт.', ky: 'Эт жана пияз менен, 5 даана', en: 'Beef and onion, 5 pcs' },
        priceSom: 300,
        weight: [5, WeightUnit.PCS],
        halal: true,
        modifiers: [
          {
            name: { ru: 'Соус', ky: 'Соус', en: 'Sauce' },
            min: 0,
            max: 2,
            options: [
              { name: { ru: 'Сметана', ky: 'Каймак', en: 'Sour cream' }, deltaSom: 30 },
              { name: { ru: 'Острый соус', ky: 'Ачуу соус', en: 'Hot sauce' }, deltaSom: 20 },
            ],
          },
        ],
      },
      {
        key: 'beshbarmak',
        name: { ru: 'Бешбармак', ky: 'Бешбармак', en: 'Beshbarmak' },
        description: {
          ru: 'Домашняя лапша, отварная конина и баранина, бульон',
          ky: 'Үй кесмеси, бышкан жылкы жана кой эти, сорпо',
          en: 'Homemade noodles, boiled horse meat and lamb, broth',
        },
        priceSom: 480,
        weight: [500, WeightUnit.G],
        halal: true,
        available: false, // демонстрация стоп-листа
      },
      {
        key: 'kuurdak',
        name: { ru: 'Куурдак', ky: 'Куурдак', en: 'Kuurdak' },
        description: {
          ru: 'Жареная говядина с картофелем и луком',
          ky: 'Картошка жана пияз менен куурулган уй эти',
          en: 'Fried beef with potatoes and onion',
        },
        priceSom: 420,
        weight: [350, WeightUnit.G],
        spicy: true,
        halal: true,
      },
    ],
  },
  {
    name: { ru: 'Супы', ky: 'Шорполор', en: 'Soups' },
    dishes: [
      {
        key: 'shorpo',
        name: { ru: 'Шорпо', ky: 'Шорпо', en: 'Shorpo' },
        description: { ru: 'Бульон из баранины с овощами', ky: 'Жашылчалуу кой этинин сорпосу', en: 'Lamb broth with vegetables' },
        priceSom: 280,
        weight: [400, WeightUnit.ML],
        halal: true,
      },
      {
        key: 'ashlyamfu',
        name: { ru: 'Ашлям-фу', ky: 'Ашлямфу', en: 'Ashlyam-fu' },
        description: {
          ru: 'Холодный острый суп с крахмальной лапшой',
          ky: 'Крахмал кесмеси менен муздак ачуу шорпо',
          en: 'Cold spicy soup with starch noodles',
        },
        priceSom: 150,
        weight: [350, WeightUnit.ML],
        spicy: true,
        hit: true,
      },
    ],
  },
  {
    name: { ru: 'Салаты и закуски', ky: 'Салаттар жана закускалар', en: 'Salads & starters' },
    dishes: [
      {
        key: 'achichuk',
        name: { ru: 'Салат «Ачичук»', ky: '«Аччык-чучук» салаты', en: 'Achichuk salad' },
        description: { ru: 'Помидоры, лук, перец', ky: 'Помидор, пияз, калемпир', en: 'Tomatoes, onion, pepper' },
        priceSom: 160,
        weight: [200, WeightUnit.G],
        halal: true,
      },
      {
        key: 'samsa',
        name: { ru: 'Самса с говядиной', ky: 'Уй эти менен самса', en: 'Beef samsa' },
        priceSom: 120,
        weight: [1, WeightUnit.PCS],
        halal: true,
      },
      {
        key: 'bread',
        name: { ru: 'Лепёшка', ky: 'Нан', en: 'Flatbread' },
        priceSom: 40,
        weight: [1, WeightUnit.PCS],
        halal: true,
      },
    ],
  },
  {
    name: { ru: 'Напитки', ky: 'Суусундуктар', en: 'Drinks' },
    dishes: [
      {
        key: 'tea',
        name: { ru: 'Чай', ky: 'Чай', en: 'Tea' },
        priceSom: 100,
        weight: [800, WeightUnit.ML],
        station: Station.BAR,
        modifiers: [
          {
            name: { ru: 'Вид', ky: 'Түрү', en: 'Type' },
            min: 1,
            max: 1,
            options: [
              { name: { ru: 'Чёрный', ky: 'Кара', en: 'Black' }, isDefault: true },
              { name: { ru: 'Зелёный', ky: 'Көк', en: 'Green' } },
            ],
          },
          {
            name: { ru: 'Добавить', ky: 'Кошуу', en: 'Add' },
            min: 0,
            max: 2,
            options: [
              { name: { ru: 'Лимон', ky: 'Лимон', en: 'Lemon' }, deltaSom: 20 },
              { name: { ru: 'Молоко', ky: 'Сүт', en: 'Milk' }, deltaSom: 20 },
            ],
          },
        ],
      },
      {
        key: 'kompot',
        name: { ru: 'Компот домашний', ky: 'Үй компоту', en: 'Homemade kompot' },
        priceSom: 90,
        weight: [500, WeightUnit.ML],
        station: Station.BAR,
      },
      {
        key: 'maksym',
        name: { ru: 'Максым', ky: 'Максым', en: 'Maksym' },
        description: {
          ru: 'Традиционный зерновой напиток',
          ky: 'Салттуу дан суусундугу',
          en: 'Traditional grain drink',
        },
        priceSom: 70,
        weight: [300, WeightUnit.ML],
        station: Station.BAR,
      },
    ],
  },
];

/** «К этому берут» */
const UPSELLS: [string, string[]][] = [
  ['lagman', ['bread', 'tea', 'achichuk']],
  ['plov', ['achichuk', 'tea', 'kompot']],
  ['manty', ['tea', 'shorpo']],
  ['kuurdak', ['bread', 'maksym']],
  ['shorpo', ['bread', 'samsa']],
];

/**
 * PIN демо-сотрудников и супер-админа. В разработке — известные (см. README),
 * в продакшене — только из секретной переменной SEED_PIN: репозиторий публичный.
 */
const prodPin = process.env.SEED_PIN;
if (process.env.NODE_ENV === 'production' && !/^\d{4,6}$/.test(prodPin ?? '')) {
  throw new Error('В продакшене задайте SEED_PIN (4–6 цифр) — PIN из README публичны');
}
const pin = (dev: string) => prodPin ?? dev;

async function main() {
  // Режим «только если пусто» — для автозапуска при деплое: существующий демо-ресторан не трогаем
  if (process.env.SEED_ONLY_IF_EMPTY && (await prisma.restaurant.count({ where: { slug: DEMO_SLUG } }))) {
    console.log('Демо-ресторан уже есть — сиды пропущены');
    return;
  }
  await prisma.restaurant.deleteMany({ where: { slug: DEMO_SLUG } });

  const plan = await prisma.plan.upsert({
    where: { code: 'standard' },
    update: {},
    create: { code: 'standard', name: 'Стандарт', priceTyiyn: somToTyiyn(3500), maxTables: 40 },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: DEMO_SLUG,
      name: 'Ала-Тоо',
      serviceFeeBp: 1000,
      accentColor: '#C2410C',
      twoGisUrl: 'https://2gis.kg/bishkek',
      orderFlow: 'DIRECT_TO_KITCHEN',
    },
  });
  const rid = restaurant.id;

  const now = new Date();
  await prisma.subscription.create({
    data: {
      restaurantId: rid,
      planId: plan.id,
      status: 'TRIAL',
      periodStart: now,
      periodEnd: new Date(now.getTime() + 14 * 24 * 3600 * 1000),
      note: 'Демо',
    },
  });

  const venue = await prisma.venue.create({
    data: {
      restaurantId: rid,
      name: 'Ала-Тоо, центр',
      address: 'Бишкек, пр. Чуй, 100',
      // Часы не заданы — открыто всегда (настраиваются в панели: «Настройки → Часы работы»)
      openingHours: {},
    },
  });

  await prisma.table.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      restaurantId: rid,
      venueId: venue.id,
      label: String(i + 1),
      sortOrder: i,
    })),
  });

  const staff: [string, string, string, 'manager' | 'waiter' | 'kitchen', Station | null][] = [
    ['Айгуль (менеджер)', '+996700000001', pin('1234'), 'manager', null],
    ['Бакыт (официант)', '+996700000002', pin('1111'), 'waiter', null],
    ['Нурлан (кухня)', '+996700000003', pin('2222'), 'kitchen', Station.KITCHEN],
    ['Эльмира (бар)', '+996700000004', pin('3333'), 'kitchen', Station.BAR],
  ];
  await prisma.staff.createMany({
    data: staff.map(([name, phone, pin, role, station]) => ({
      restaurantId: rid,
      venueId: venue.id,
      name,
      phone,
      pinHash: hashPin(pin),
      role,
      station,
    })),
  });

  const dishIds = new Map<string, string>();
  for (const [ci, cat] of MENU.entries()) {
    const category = await prisma.category.create({ data: { restaurantId: rid, name: cat.name, sortOrder: ci } });
    for (const [di, d] of cat.dishes.entries()) {
      const dish = await prisma.dish.create({
        data: {
          restaurantId: rid,
          categoryId: category.id,
          name: d.name,
          description: d.description ?? {},
          priceTyiyn: somToTyiyn(d.priceSom),
          weightValue: d.weight?.[0],
          weightUnit: d.weight?.[1],
          station: d.station ?? Station.KITCHEN,
          isHit: d.hit ?? false,
          isSpicy: d.spicy ?? false,
          isHalal: d.halal ?? false,
          isAvailable: d.available ?? true,
          sortOrder: di,
          modifierGroups: {
            create: (d.modifiers ?? []).map((g, gi) => ({
              restaurantId: rid,
              name: g.name,
              minSelect: g.min,
              maxSelect: g.max,
              sortOrder: gi,
              modifiers: {
                create: g.options.map((o, oi) => ({
                  restaurantId: rid,
                  name: o.name,
                  priceDeltaTyiyn: somToTyiyn(o.deltaSom ?? 0),
                  isDefault: o.isDefault ?? false,
                  sortOrder: oi,
                })),
              },
            })),
          },
        },
      });
      dishIds.set(d.key, dish.id);
    }
  }

  await prisma.upsell.createMany({
    data: UPSELLS.flatMap(([from, tos]) =>
      tos.map((to, i) => ({
        restaurantId: rid,
        dishId: dishIds.get(from)!,
        suggestedDishId: dishIds.get(to)!,
        sortOrder: i,
      })),
    ),
  });

  console.log(`Сиды готовы: ресторан «${restaurant.name}» (${DEMO_SLUG}), блюд: ${dishIds.size}, столов: 10`);

  // Сотрудник платформы для супер-админки (/platform). Только для разработки — в проде создать своего.
  await prisma.platformAdmin.upsert({
    where: { phone: '+996700000099' },
    update: {},
    create: { name: 'Админ платформы', phone: '+996700000099', pinHash: hashPin(pin('999999')) },
  });
  console.log(`Супер-админка: /platform, +996700000099${prodPin ? ' (PIN из SEED_PIN)' : ' / 999999'}`);

  const secret = process.env.QR_SIGNING_SECRET ?? 'dev-qr-secret-change-me';
  const origin = process.env.PUBLIC_WEB_URL ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const tables = await prisma.table.findMany({ where: { restaurantId: rid }, orderBy: { sortOrder: 'asc' }, take: 3 });
  console.log('Ссылки столов (первые 3):');
  for (const tb of tables) {
    console.log(`  стол ${tb.label}: ${origin}/m/${DEMO_SLUG}/${createTableToken(tb.id, tb.tokenVersion, secret)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
