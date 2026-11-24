'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ModifierSelection } from '@qrmenu/shared';

/** Позиция корзины гостя. Цена здесь — для показа; сервер пересчитывает её при заказе. */
export interface CartLine {
  key: string;
  dishId: string;
  selection: ModifierSelection;
  comment: string;
  quantity: number;
  unitPriceTyiyn: number;
}

const storageKey = (slug: string, tableId: string) => `cart:${slug}:${tableId}`;

function lineKey(dishId: string, selection: ModifierSelection, comment: string): string {
  const sel = Object.keys(selection)
    .sort()
    .map((g) => `${g}=${[...(selection[g] ?? [])].sort().join(',')}`)
    .join(';');
  return `${dishId}|${sel}|${comment.trim()}`;
}

function read(key: string): CartLine[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

/** Корзина в localStorage, отдельно на каждый стол. Одинаковые позиции складываются. */
export function useCart(slug: string, tableId: string) {
  const key = storageKey(slug, tableId);
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => setLines(read(key)), [key]);

  const save = useCallback(
    (update: (current: CartLine[]) => CartLine[]) =>
      setLines((current) => {
        const next = update(current);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* приватный режим — корзина живёт только в памяти */
        }
        return next;
      }),
    [key],
  );

  const add = useCallback(
    (line: Omit<CartLine, 'key'>) => {
      const k = lineKey(line.dishId, line.selection, line.comment);
      save((cur) =>
        cur.some((l) => l.key === k)
          ? cur.map((l) => (l.key === k ? { ...l, quantity: l.quantity + line.quantity } : l))
          : [...cur, { ...line, comment: line.comment.trim(), key: k }],
      );
    },
    [save],
  );

  /** quantity ≤ 0 — удалить позицию */
  const setQuantity = useCallback(
    (k: string, quantity: number) =>
      save((cur) => (quantity <= 0 ? cur.filter((l) => l.key !== k) : cur.map((l) => (l.key === k ? { ...l, quantity } : l)))),
    [save],
  );

  const clear = useCallback(() => save(() => []), [save]);

  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPriceTyiyn, 0);
  return { lines, add, setQuantity, clear, count, total };
}

export type Cart = ReturnType<typeof useCart>;
