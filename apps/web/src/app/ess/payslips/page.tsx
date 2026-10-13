'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EssPayslipsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/payroll/payslips');
  }, [router]);
  return null;
}
