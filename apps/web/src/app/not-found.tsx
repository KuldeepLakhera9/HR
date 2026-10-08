'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@hrms/ui';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6 text-center">
      <div className="max-w-md bg-white p-8 rounded-2xl border border-stone-200/80 shadow-md space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-stone-900">Page Not Found</h1>
        <p className="text-xs text-stone-500">
          The module or resource you are looking for is either restricted or does not exist.
        </p>
        <div className="pt-2">
          <Link href="/dashboard">
            <Button size="sm">Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
