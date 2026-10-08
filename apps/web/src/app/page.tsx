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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory-50 text-stone-500 gap-2">
      <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
      <p className="text-xs font-medium">Entering PeopleOS workspace...</p>
    </div>
  );
}
