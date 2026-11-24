import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'QR-меню · персонал',
  manifest: '/staff.webmanifest',
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: '#1c1917' };

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
