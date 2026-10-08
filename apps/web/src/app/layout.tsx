import React from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { RoleProvider } from '../context/RoleContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PeopleOS | Self-Hosted Enterprise HRMS',
  description:
    'Production-grade self-hosted Human Resource Management System for modern organizations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-ivory-50 text-stone-900 antialiased selection:bg-amber-200">
        <RoleProvider>{children}</RoleProvider>
      </body>
    </html>
  );
}
