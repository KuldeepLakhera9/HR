'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

export default function EssPayslipDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolved = use(params);
  useEffect(() => {
    if (resolved.id) {
      router.replace(`/payroll/payslips/${resolved.id}`);
    }
  }, [router, resolved.id]);
  return null;
}
