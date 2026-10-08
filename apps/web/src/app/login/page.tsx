'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button, Input, Card, Badge } from '@hrms/ui';

interface DemoPersona {
  role: 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';
  label: string;
  email: string;
  title: string;
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    role: 'ADMIN',
    label: 'Admin',
    email: 'admin@peopleos.local',
    title: 'Super Administrator',
  },
  {
    role: 'HR',
    label: 'HR',
    email: 'hr@peopleos.local',
    title: 'People Operations',
  },
  {
    role: 'MANAGER',
    label: 'Manager',
    email: 'manager@peopleos.local',
    title: 'Engineering Director',
  },
  {
    role: 'EMPLOYEE',
    label: 'Employee',
    email: 'employee@peopleos.local',
    title: 'Software Engineer',
  },
];

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';

  const {
    login,
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    clearError,
  } = useAuth();

  const [email, setEmail] = useState('admin@peopleos.local');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.replace(redirectPath);
    }
  }, [isAuthenticated, authLoading, router, redirectPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });
      router.replace(redirectPath);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please verify your credentials.';
      setLocalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectPersona = (persona: DemoPersona) => {
    setEmail(persona.email);
    setPassword('Password@123');
    setLocalError(null);
    clearError();
  };

  const displayedError = localError || authError;

  return (
    <div className="w-full max-w-md relative z-10 space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-amber-600 to-amber-500 text-white rounded-2xl shadow-md shadow-amber-600/20 mb-1">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          People<span className="text-amber-600">OS</span>
        </h1>
        <p className="text-xs text-stone-500 max-w-xs mx-auto">
          Self-Hosted Enterprise Human Resource Management System
        </p>
      </div>

      {/* Login Card */}
      <Card className="p-6 sm:p-8 bg-white/90 backdrop-blur-md border-stone-200/80 shadow-lg shadow-stone-200/50">
        <form onSubmit={handleSubmit} className="space-y-4.5">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Sign in to workspace</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Enter your organizational credentials to continue
            </p>
          </div>

          {/* Error Notification */}
          {displayedError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-rose-700 animate-in fade-in duration-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="text-xs font-medium leading-relaxed">{displayedError}</div>
            </div>
          )}

          {/* Email Field */}
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-xs font-semibold text-stone-700">
              Work Email
            </label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              autoComplete="email"
              leftIcon={<Mail className="h-4 w-4" />}
              className="bg-white"
            />
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-stone-700"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() =>
                  alert('Please contact your HR Administrator to initiate password reset.')
                }
                className="text-[11px] font-medium text-amber-600 hover:text-amber-700 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                leftIcon={<Lock className="h-4 w-4" />}
                className="bg-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 focus:outline-hidden"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full mt-2 font-medium"
            isLoading={isSubmitting}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Sign In
          </Button>
        </form>

        {/* Development Persona Shortcuts */}
        <div className="mt-6 pt-5 border-t border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-stone-600 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-amber-600" />
              Quick-Fill Test Personas
            </span>
            <Badge variant="outline" size="sm">
              Dev Seed
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_PERSONAS.map((p) => {
              const isSelected = email === p.email;
              return (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => handleSelectPersona(p)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/60 shadow-2xs'
                      : 'border-stone-200 bg-stone-50/50 hover:bg-white hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-800">{p.label}</span>
                    <span className="text-[10px] font-mono text-stone-400">{p.role}</span>
                  </div>
                  <div className="text-[11px] text-stone-500 truncate mt-0.5">{p.email}</div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-stone-400 text-center mt-2.5">
            Default password for all seeded accounts:{' '}
            <code className="font-mono text-stone-600">Password@123</code>
          </p>
        </div>
      </Card>

      {/* Security & Compliance Footer */}
      <div className="text-center text-[11px] text-stone-400 space-y-1">
        <div>Self-Hosted Private Datacenter Deployment</div>
        <div>All sessions protected with Argon2id & HttpOnly token rotation</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-ivory-50 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      {/* Background radial gradient accent */}
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 bg-white/80 rounded-2xl border border-stone-200 text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-12 w-12 bg-amber-100 rounded-2xl mx-auto" />
              <div className="h-5 bg-stone-200 rounded w-1/2 mx-auto" />
              <div className="h-4 bg-stone-100 rounded w-3/4 mx-auto" />
            </div>
          </div>
        }
      >
        <LoginFormContent />
      </Suspense>
    </div>
  );
}
