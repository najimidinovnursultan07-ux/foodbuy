import type { RestaurantStatusDto } from './menu';

// Супер-админка платформы. Подписка ставится вручную: онлайн-оплаты нет.

export type SubscriptionStatusDto = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  priceTyiyn: number;
  maxTables: number | null;
  isActive: boolean;
}

export interface PlatformRestaurantDto {
  id: string;
  slug: string;
  name: string;
  status: RestaurantStatusDto;
  createdAt: string;
  tablesCount: number;
  staffCount: number;
  lastOrderAt: string | null;
  telegramConnected: boolean;
  subscription: null | {
    planId: string;
    planName: string;
    status: SubscriptionStatusDto;
    periodEnd: string;
    note: string | null;
    /** Срок истёк (дата окончания в прошлом) */
    expired: boolean;
  };
}

export interface CreateRestaurantRequest {
  name: string;
  slug: string;
  managerName: string;
  managerPhone: string;
  managerPin: string;
  planId: string;
  trialDays: number;
}

export interface SetSubscriptionRequest {
  planId: string;
  status: SubscriptionStatusDto;
  /** YYYY-MM-DD, последний оплаченный день (включительно, Бишкек) */
  periodEnd: string;
  note?: string | null;
}

export interface PlatformLoginResponse {
  token: string;
  admin: { id: string; name: string };
}
