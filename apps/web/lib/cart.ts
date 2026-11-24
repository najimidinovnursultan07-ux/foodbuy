'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ModifierSelection } from '@qrmenu/shared';

/** Позиция корзины гостя. Цену на сервере пересчитаем при оформлении заказа (шаг 3). */
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

  const add = useCallback(
    (line: Omit<CartLine, 'key'>) => {
      const k = lineKey(line.dishId, line.selection, line.comment);
      setLines((current) => {
        const next = current.some((l) => l.key === k)
          ? current.map((l) => (l.key === k ? { ...l, quantity: l.quantity + line.quantity } : l))
          : [...current, { ...line, comment: line.comment.trim(), key: k }];
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* приватный режим — корзина живёт только в памяти */
        }
        return next;
      });
    },
    [key],
  );

  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPriceTyiyn, 0);
  return { lines, add, count, total };
}
