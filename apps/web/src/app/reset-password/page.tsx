'use client';

import React, { useState, useEffect, Suspense, useId } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowLeft,
  XCircle,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Button, Input, Card } from '@hrms/ui';
import { authApi } from '../../lib/api-client';

type ResetViewState = 'FORM' | 'SUCCESS' | 'EXPIRED_TOKEN' | 'INVALID_TOKEN';

function ResetPasswordFormContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [viewState, setViewState] = useState<ResetViewState>('FORM');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const errorAlertId = useId();

  useEffect(() => {
    // If no token is provided in the query string, immediately transition to invalid token state
    if (!token || !token.trim()) {
      setViewState('INVALID_TOKEN');
    }
  }, [token]);

  // Password Complexity Validation Rules
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const isPasswordStrong = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const passwordError =
    passwordTouched && !isPasswordStrong
      ? 'Password must meet all corporate complexity requirements'
      : null;

  const confirmError = confirmTouched && !passwordsMatch ? 'Passwords do not match' : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setConfirmTouched(true);
    setGeneralError(null);

    if (!token) {
      setViewState('INVALID_TOKEN');
      return;
    }

    if (!isPasswordStrong || !passwordsMatch) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token.trim(), newPassword);
      setViewState('SUCCESS');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reset password. Please try again.';
      const lower = errorMessage.toLowerCase();

      if (lower.includes('expired')) {
        setViewState('EXPIRED_TOKEN');
      } else if (
        lower.includes('invalid') ||
        lower.includes('already been used') ||
        lower.includes('not found')
      ) {
        setViewState('INVALID_TOKEN');
      } else {
        setGeneralError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md relative z-10 space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <Link
          href="/login"
          className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-amber-700 to-amber-500 text-white rounded-2xl shadow-md shadow-amber-600/25 mb-1 transition-transform hover:scale-105 duration-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          aria-label="PeopleOS Home"
        >
          <ShieldCheck className="h-8 w-8" aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          People<span className="text-amber-600">OS</span>
        </h1>
        <p className="text-xs text-stone-500 max-w-xs mx-auto">
          Self-Hosted Enterprise Human Resource Management System
        </p>
      </div>

      {/* Main Card */}
      <Card className="p-6 sm:p-8 bg-white/95 backdrop-blur-md border-stone-200/90 shadow-xl shadow-stone-200/50">
        {/* ==================================================================== */}
        {/* STATE 1: ACTIVE RESET FORM */}
        {/* ==================================================================== */}
        {viewState === 'FORM' && (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Create new password</h2>
              <p className="text-xs text-stone-500 mt-1">
                Your new password must satisfy enterprise security policies.
              </p>
            </div>

            {/* General Error Banner */}
            {generalError && (
              <div
                id={errorAlertId}
                role="alert"
                className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
                <span>{generalError}</span>
              </div>
            )}

            {/* New Password Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="reset-new-password"
                className="block text-xs font-semibold text-stone-700 tracking-wide"
              >
                New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Input
                  id="reset-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  name="newPassword"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (generalError) setGeneralError(null);
                  }}
                  onBlur={() => setPasswordTouched(true)}
                  placeholder="Enter strong password"
                  required
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-required="true"
                  aria-invalid={Boolean(passwordError)}
                  leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                  error={passwordError || undefined}
                  className="bg-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 focus:outline-hidden focus:text-stone-800 transition-colors"
                  aria-label={showNewPassword ? 'Hide password text' : 'Show password text'}
                  aria-pressed={showNewPassword}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="reset-confirm-password"
                className="block text-xs font-semibold text-stone-700 tracking-wide"
              >
                Confirm New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (generalError) setGeneralError(null);
                  }}
                  onBlur={() => setConfirmTouched(true)}
                  placeholder="Re-enter new password"
                  required
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-required="true"
                  aria-invalid={Boolean(confirmError)}
                  leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                  error={confirmError || undefined}
                  className="bg-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 focus:outline-hidden focus:text-stone-800 transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password text' : 'Show password text'}
                  aria-pressed={showConfirmPassword}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Password Complexity Checklist */}
            <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl space-y-1.5 text-[11px]">
              <span className="font-semibold text-stone-700 block">Password requirements:</span>
              <ul className="space-y-1">
                <li
                  className={`flex items-center gap-1.5 ${
                    hasMinLength ? 'text-emerald-700 font-medium' : 'text-stone-500'
                  }`}
                >
                  {hasMinLength ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-stone-400 ml-1 mr-1" />
                  )}
                  At least 8 characters
                </li>
                <li
                  className={`flex items-center gap-1.5 ${
                    hasUppercase ? 'text-emerald-700 font-medium' : 'text-stone-500'
                  }`}
                >
                  {hasUppercase ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-stone-400 ml-1 mr-1" />
                  )}
                  At least one uppercase letter (A-Z)
                </li>
                <li
                  className={`flex items-center gap-1.5 ${
                    hasLowercase ? 'text-emerald-700 font-medium' : 'text-stone-500'
                  }`}
                >
                  {hasLowercase ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-stone-400 ml-1 mr-1" />
                  )}
                  At least one lowercase letter (a-z)
                </li>
                <li
                  className={`flex items-center gap-1.5 ${
                    hasNumber ? 'text-emerald-700 font-medium' : 'text-stone-500'
                  }`}
                >
                  {hasNumber ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-stone-400 ml-1 mr-1" />
                  )}
                  At least one number (0-9)
                </li>
                <li
                  className={`flex items-center gap-1.5 ${
                    hasSpecial ? 'text-emerald-700 font-medium' : 'text-stone-500'
                  }`}
                >
                  {hasSpecial ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-stone-400 ml-1 mr-1" />
                  )}
                  At least one special symbol (!@#$%^&*)
                </li>
              </ul>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full mt-2 font-medium"
              isLoading={isSubmitting}
              disabled={isSubmitting || !isPasswordStrong || !passwordsMatch}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              {isSubmitting ? 'Updating password...' : 'Update Password'}
            </Button>

            {/* Return to login */}
            <div className="pt-1 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-amber-700 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel and return to Sign In
              </Link>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* STATE 2: SUCCESS STATE */}
        {/* ==================================================================== */}
        {viewState === 'SUCCESS' && (
          <div className="text-center space-y-4 py-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="inline-flex items-center justify-center p-3.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full mx-auto">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-stone-900">Password reset complete</h2>
              <p className="text-xs text-stone-600 leading-relaxed max-w-sm mx-auto">
                Your password has been securely updated. You can now sign in using your new
                credentials.
              </p>
            </div>

            {/* Security Notice: Session Revocation */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-left text-[11px] text-emerald-950 leading-relaxed">
              <div className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-900">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                Active Sessions Revoked
              </div>
              For your enterprise account security, all previous active sessions on other browsers
              and mobile devices have been terminated.
            </div>

            <div className="pt-2">
              <Link href="/login" className="block w-full">
                <Button className="w-full" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Proceed to Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STATE 3: EXPIRED TOKEN STATE */}
        {/* ==================================================================== */}
        {viewState === 'EXPIRED_TOKEN' && (
          <div className="text-center space-y-4 py-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="inline-flex items-center justify-center p-3.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full mx-auto">
              <Clock className="h-8 w-8" aria-hidden="true" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-stone-900">Reset link expired</h2>
              <p className="text-xs text-stone-600 leading-relaxed max-w-sm mx-auto">
                For security reasons, password reset links expire after <strong>60 minutes</strong>.
                Please request a new reset link to continue.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <Link href="/forgot-password" className="block w-full">
                <Button className="w-full" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Request New Reset Link
                </Button>
              </Link>
              <Link href="/login" className="block w-full">
                <Button variant="outline" className="w-full">
                  Return to Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STATE 4: INVALID TOKEN STATE */}
        {/* ==================================================================== */}
        {viewState === 'INVALID_TOKEN' && (
          <div className="text-center space-y-4 py-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="inline-flex items-center justify-center p-3.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full mx-auto">
              <AlertTriangle className="h-8 w-8" aria-hidden="true" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-stone-900">Invalid or already used link</h2>
              <p className="text-xs text-stone-600 leading-relaxed max-w-sm mx-auto">
                This password reset link is invalid or has already been used. Each link can only be
                used once to ensure account integrity.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <Link href="/forgot-password" className="block w-full">
                <Button className="w-full" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Request New Reset Link
                </Button>
              </Link>
              <Link href="/login" className="block w-full">
                <Button variant="outline" className="w-full">
                  Return to Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Card>

      {/* Support Footer */}
      <div className="text-center">
        <p className="text-[11px] text-stone-400 flex items-center justify-center gap-1">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Need assistance? Contact your People Operations administrator.
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main
      className="min-h-screen w-full flex flex-col justify-center items-center p-4 sm:p-6 bg-stone-50 text-stone-900 relative overflow-hidden"
      style={{
        backgroundColor: '#FAF8F5',
        backgroundImage:
          'radial-gradient(#E7E2DA 1px, transparent 1px), radial-gradient(#F0ECE4 1px, #FAF8F5 1px)',
        backgroundSize: '40px 40px',
        backgroundPosition: '0 0, 20px 20px',
      }}
    >
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-200/25 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 text-center text-sm text-stone-500 bg-white rounded-2xl border border-stone-200 shadow-lg">
            Loading password reset verification...
          </div>
        }
      >
        <ResetPasswordFormContent />
      </Suspense>
    </main>
  );
}
