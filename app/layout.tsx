import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Barber Money Tracker', description: 'Know your numbers. Grow your craft. Track barber income, tips, rent, and expenses.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
