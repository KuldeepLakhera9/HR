'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [router, isAuthenticated, isLoading]);

  // Safety fallback: If still on root page after 1.5s, force navigation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [router, isAuthenticated]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory-50 text-stone-500 gap-2">
      <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
      <p className="text-xs font-medium">Entering ADT-AI Training Foundation workspace...</p>
      <div className="mt-3">
        <button
          onClick={() => router.replace('/login')}
          className="text-xs text-amber-700 hover:text-amber-900 underline font-medium"
        >
          Click here if not redirected automatically
        </button>
      </div>
    </div>
  );
}
