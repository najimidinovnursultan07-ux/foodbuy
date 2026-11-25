import { redirect } from 'next/navigation';

// Гости попадают в меню по ссылке из QR-кода стола (/m/<ресторан>/<токен>).
// Главную открывают персонал и владельцы — сразу ведём на вход.
export default function Home() {
  redirect('/staff');
}
