// Отзыв гостя после закрытия счёта.

export const REVIEW_WINDOW_HOURS = 6;

export interface ReviewStatusDto {
  /** Можно оставить отзыв: счёт этого стола закрыт недавно и отзыва ещё нет */
  canReview: boolean;
}

export interface ReviewRequest {
  billId: string;
  rating: number;
  comment?: string;
}

export interface ReviewResponse {
  /** Для 4–5★ — ссылка на 2GIS ресторана (если задана); для 1–3★ — null, отзыв видит только владелец */
  twoGisUrl: string | null;
}
