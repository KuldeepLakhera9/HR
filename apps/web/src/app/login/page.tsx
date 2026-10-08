'use client';

import React, { useState, useEffect, Suspense, useId } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Info,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import { Button, Input, Card, Badge, Dialog } from '@hrms/ui';

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

type AuthErrorType =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'NETWORK_ERROR'
  | 'GENERIC_ERROR'
  | null;

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';
  const isSessionExpired =
    searchParams.get('reason') === 'expired' || searchParams.get('expired') === 'true';

  const { login, isAuthenticated, isLoading: authLoading, clearError } = useAuth();

  // Form State
  const [email, setEmail] = useState('admin@peopleos.local');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field-level Validation State
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  // Categorized Error State
  const [errorType, setErrorType] = useState<AuthErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals & Panels
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSubmitted, setForgotPasswordSubmitted] = useState(false);
  const [showDevPersonas, setShowDevPersonas] = useState(true);

  // Unique IDs for accessibility
  const emailHelpId = useId();
  const passwordHelpId = useId();
  const errorAlertId = useId();

  // If already authenticated and not loading, redirect to target
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.replace(redirectPath);
    }
  }, [isAuthenticated, authLoading, router, redirectPath]);

  // Client-side email format validation
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailError =
    emailTouched && !email.trim()
      ? 'Work email is required'
      : emailTouched && !isEmailValid
        ? 'Please enter a valid work email address'
        : null;

  const passwordError = passwordTouched && !password ? 'Password is required to sign in' : null;

  const handleEmailBlur = () => setEmailTouched(true);
  const handlePasswordBlur = () => setPasswordTouched(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    setErrorType(null);
    setErrorMessage(null);
    clearError();

    if (!email.trim() || !isEmailValid || !password) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });
      router.replace(redirectPath);
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Authentication failed';
      const lower = rawMessage.toLowerCase();

      // Categorize without leaking account existence
      if (lower.includes('locked')) {
        setErrorType('ACCOUNT_LOCKED');
        setErrorMessage(
          'Your account has been temporarily locked due to multiple consecutive failed attempts. Please wait 15 minutes before retrying.',
        );
      } else if (
        lower.includes('inactive') ||
        lower.includes('disabled') ||
        lower.includes('suspended')
      ) {
        setErrorType('ACCOUNT_DISABLED');
        setErrorMessage(
          'Your account is currently disabled or suspended. Please contact your HR administrator for assistance.',
        );
      } else if (
        lower.includes('network') ||
        lower.includes('failed to fetch') ||
        lower.includes('connection')
      ) {
        setErrorType('NETWORK_ERROR');
        setErrorMessage(
          'Unable to reach authentication server. Please check your network connection and try again.',
        );
      } else {
        // Uniform non-enumerating error for any invalid credentials
        setErrorType('INVALID_CREDENTIALS');
        setErrorMessage(
          'Invalid work email or password. Please verify your credentials and try again.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectPersona = (persona: DemoPersona) => {
    setEmail(persona.email);
    setPassword('Password@123');
    setEmailTouched(false);
    setPasswordTouched(false);
    setErrorType(null);
    setErrorMessage(null);
    clearError();
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordSubmitted(true);
  };

  const resetForgotPasswordModal = () => {
    setForgotPasswordOpen(false);
    setForgotPasswordSubmitted(false);
    setForgotPasswordEmail('');
  };

  return (
    <div className="w-full max-w-md relative z-10 space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-amber-700 to-amber-500 text-white rounded-2xl shadow-md shadow-amber-600/25 mb-1 transition-transform hover:scale-105 duration-200">
          <ShieldCheck className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          People<span className="text-amber-600">OS</span>
        </h1>
        <p className="text-xs text-stone-500 max-w-xs mx-auto">
          Self-Hosted Enterprise Human Resource Management System
        </p>
      </div>

      {/* Login Card */}
      <Card className="p-6 sm:p-8 bg-white/95 backdrop-blur-md border-stone-200/90 shadow-xl shadow-stone-200/50">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Sign in to workspace</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Enter your organizational credentials to continue
            </p>
          </div>

          {/* Session Expired Banner */}
          {isSessionExpired && !errorMessage && (
            <div
              role="status"
              className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 flex items-start gap-2.5 animate-in fade-in duration-200"
            >
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
              <div className="text-xs font-medium leading-relaxed">
                Your previous session has expired. Please sign in again to resume your work.
              </div>
            </div>
          )}

          {/* Categorized Error Alert Banner */}
          {errorMessage && (
            <div
              id={errorAlertId}
              role="alert"
              aria-live="polite"
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-medium leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200 ${
                errorType === 'ACCOUNT_LOCKED'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : errorType === 'ACCOUNT_DISABLED'
                    ? 'bg-stone-100 border-stone-300 text-stone-800'
                    : errorType === 'NETWORK_ERROR'
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {errorType === 'ACCOUNT_LOCKED' ? (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 mt-0.5 text-amber-600"
                  aria-hidden="true"
                />
              ) : errorType === 'NETWORK_ERROR' ? (
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-600" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
              )}
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Work Email Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-stone-700 tracking-wide"
            >
              Work Email <span className="text-rose-500">*</span>
            </label>
            <Input
              id="login-email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorType) setErrorType(null);
                if (errorMessage) setErrorMessage(null);
              }}
              onBlur={handleEmailBlur}
              placeholder="name@company.com"
              required
              autoComplete="email"
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={Boolean(emailError || errorType)}
              aria-describedby={emailError ? emailHelpId : undefined}
              leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              error={emailError || undefined}
              className="bg-white"
            />
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-stone-700 tracking-wide"
              >
                Password <span className="text-rose-500">*</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-medium text-amber-700 hover:text-amber-800 hover:underline focus:outline-hidden focus:ring-1 focus:ring-amber-500 rounded"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorType) setErrorType(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                onBlur={handlePasswordBlur}
                placeholder="Enter account password"
                required
                autoComplete="current-password"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={Boolean(passwordError || errorType)}
                aria-describedby={passwordError ? passwordHelpId : undefined}
                leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                error={passwordError || undefined}
                className="bg-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 focus:outline-hidden focus:text-stone-800 transition-colors"
                aria-label={showPassword ? 'Hide password text' : 'Show password text'}
                aria-pressed={showPassword}
                tabIndex={0}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Sign In Button */}
          <Button
            type="submit"
            className="w-full mt-2 font-medium"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        {/* Development Quick-Fill Personas (Collapsible) */}
        <div className="mt-6 pt-5 border-t border-stone-150">
          <button
            type="button"
            onClick={() => setShowDevPersonas((prev) => !prev)}
            className="w-full flex items-center justify-between text-left text-[11px] font-semibold text-stone-600 hover:text-stone-900 focus:outline-hidden"
            aria-expanded={showDevPersonas}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              Quick-Fill Test Personas
            </span>
            <span className="flex items-center gap-1 text-[10px] text-stone-400">
              <Badge variant="outline" size="sm">
                Dev Seed
              </Badge>
              {showDevPersonas ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
          </button>

          {showDevPersonas && (
            <div className="mt-3 space-y-2 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-2">
                {DEMO_PERSONAS.map((p) => {
                  const isSelected = email === p.email;
                  return (
                    <button
                      key={p.role}
                      type="button"
                      onClick={() => handleSelectPersona(p)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/70 shadow-2xs'
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
              <p className="text-[10px] text-stone-400 text-center pt-1">
                Password for all seeded personas:{' '}
                <code className="font-mono text-stone-600">Password@123</code>
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Forgot Password Modal Dialog */}
      <Dialog
        isOpen={forgotPasswordOpen}
        onClose={resetForgotPasswordModal}
        title="Reset Account Password"
        description="Self-Hosted PeopleOS Security Verification"
        maxWidth="md"
      >
        <div className="p-6 space-y-4">
          {!forgotPasswordSubmitted ? (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <p className="text-xs text-stone-600 leading-relaxed">
                Enter your registered organizational work email. In accordance with enterprise
                security policy, password resets are coordinated with your HR Operations
                administrator or via automated dispatch.
              </p>
              <div className="space-y-1.5">
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-semibold text-stone-700"
                >
                  Work Email
                </label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetForgotPasswordModal}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Request Reset
                </Button>
              </div>
            </form>
          ) : (
            <div className="py-2 text-center space-y-3">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h4 className="text-sm font-semibold text-stone-900">Request Dispatched</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                If an active account exists for{' '}
                <strong className="text-stone-800">{forgotPasswordEmail || 'your email'}</strong>,
                instructions have been logged. Please contact your internal HR Administrator to
                complete the verification.
              </p>
              <Button size="sm" onClick={resetForgotPasswordModal} className="mt-2">
                Back to Sign In
              </Button>
            </div>
          )}
        </div>
      </Dialog>

      {/* Security & Deployment Footer */}
      <div className="text-center text-[11px] text-stone-400 space-y-1">
        <div>Self-Hosted Private Datacenter Deployment</div>
        <div className="flex items-center justify-center gap-1.5">
          <span>Protected with Argon2id</span>
          <span>•</span>
          <span>HttpOnly Refresh Rotation</span>
          <span>•</span>
          <span>Zero Third-Party Trackers</span>
        </div>
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
