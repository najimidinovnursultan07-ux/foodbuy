/** Деньги храним в тыйынах (1 сом = 100 тыйын), целыми числами. */
export const TYIYN_PER_SOM = 100;

const NBSP = ' ';

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/**
 * 125000 → «1 250 сом»; 125050 → «1 250,50 сом».
 * Разделитель тысяч и пробел перед «сом» — неразрывные, чтобы цена не переносилась.
 */
export function formatSom(tyiyn: number, unit = 'сом'): string {
  if (!Number.isInteger(tyiyn)) throw new TypeError(`Сумма должна быть целым числом тыйын: ${tyiyn}`);
  const sign = tyiyn < 0 ? '-' : '';
  const abs = Math.abs(tyiyn);
  const som = Math.floor(abs / TYIYN_PER_SOM);
  const rest = abs % TYIYN_PER_SOM;
  const frac = rest === 0 ? '' : ',' + String(rest).padStart(2, '0');
  return sign + groupThousands(som) + frac + NBSP + unit;
}

/** 1250 → 125000. Принимает сомы (число или строку «1 250,5»). */
export function somToTyiyn(som: number | string): number {
  const n = typeof som === 'string' ? Number(som.replace(/[\s ]/g, '').replace(',', '.')) : som;
  if (!Number.isFinite(n)) throw new TypeError(`Некорректная сумма: ${som}`);
  return Math.round(n * TYIYN_PER_SOM);
}

/** Процент в базисных пунктах (1000 = 10%). Округление до тыйына. */
export function percentOf(tyiyn: number, basisPoints: number): number {
  return Math.round((tyiyn * basisPoints) / 10_000);
}
