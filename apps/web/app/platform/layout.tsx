import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'QR-меню · платформа', robots: { index: false } };

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
