import React from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { AuthProvider } from '../context/AuthContext';
import { RoleProvider } from '../context/RoleContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ADT-AI Training Foundation | Enterprise HRMS',
  description:
    'Production-grade Enterprise Human Resource Management System for ADT-AI Training Foundation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-ivory-50 text-stone-900 antialiased selection:bg-amber-200">
        <AuthProvider>
          <RoleProvider>{children}</RoleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
