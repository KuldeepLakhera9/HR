'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
      <p className="text-sm font-medium text-stone-500">Redirecting to HRMS workspace...</p>
    </div>
  );
}
