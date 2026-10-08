'use client';

import React, { useEffect } from 'react';
import { Button } from '@hrms/ui';
import { AlertCircle } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled runtime error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-ivory-50 flex items-center justify-center p-6 text-center">
      <div className="max-w-md bg-white p-8 rounded-2xl border border-rose-200 shadow-md space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-stone-900">Application Error</h1>
        <p className="text-xs text-stone-500">
          An unexpected exception occurred while rendering this interface.
        </p>
        <div className="pt-2">
          <Button variant="danger" size="sm" onClick={() => reset()}>
            Reload Component
          </Button>
        </div>
      </div>
    </div>
  );
}
