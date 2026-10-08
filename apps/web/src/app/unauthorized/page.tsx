'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft, Home, LogOut } from 'lucide-react';
import { Button, Card, Badge } from '@hrms/ui';
import { useAuth } from '../../context/AuthContext';

export default function UnauthorizedPage() {
  const router = useRouter();
  const { user, roles, logout } = useAuth();

  return (
    <div className="min-h-screen bg-ivory-50 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      {/* Background accent */}
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        <Card className="p-6 sm:p-8 bg-white/95 backdrop-blur-md border-rose-200/80 shadow-lg text-center space-y-5">
          <div className="mx-auto w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center border border-rose-200/60 shadow-2xs">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <div className="space-y-1.5">
            <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50/50">
              403 Forbidden
            </Badge>
            <h1 className="text-xl font-bold text-stone-900">Access Restricted</h1>
            <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
              Your account does not possess the necessary privileges or organizational data scope to
              access this section.
            </p>
          </div>

          {user && (
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-left text-xs space-y-1">
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Current Session
              </div>
              <div className="font-medium text-stone-900">
                {user.firstName} {user.lastName} ({user.email})
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[11px] text-stone-500">Roles:</span>
                {roles.map((r) => (
                  <Badge key={r} size="sm" variant="default">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Button
              variant="outline"
              onClick={() => router.back()}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              className="flex-1"
            >
              Go Back
            </Button>
            <Link href="/dashboard" className="flex-1">
              <Button leftIcon={<Home className="h-4 w-4" />} className="w-full">
                Dashboard
              </Button>
            </Link>
          </div>

          <div className="pt-3 border-t border-stone-100">
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign in with a different account
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
