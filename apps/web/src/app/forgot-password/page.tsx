'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Button, Input, Card } from '@hrms/ui';
import { authApi } from '../../lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailError =
    emailTouched && !email.trim()
      ? 'Work email is required'
      : emailTouched && !isEmailValid
        ? 'Please enter a valid corporate email address'
        : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    setErrorMessage(null);

    if (!isEmailValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setIsSubmitted(true);
    } catch (err) {
      // Even if network or unexpected failure, provide safe guidance
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to process reset request. Please check your connection and try again.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setIsSubmitted(false);
    setEmail('');
    setEmailTouched(false);
    setErrorMessage(null);
  };

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
      {/* Decorative Warm Ambient Glows */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-200/25 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

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

        {/* Card Container */}
        <Card className="p-6 sm:p-8 bg-white/95 backdrop-blur-md border-stone-200/90 shadow-xl shadow-stone-200/50">
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Reset your password</h2>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Enter your registered work email and we will send you secure instructions to reset
                  your password.
                </p>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200"
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0 mt-0.5 text-rose-600"
                    aria-hidden="true"
                  />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-semibold text-stone-700 tracking-wide"
                >
                  Work Email <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="forgot-email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  disabled={isSubmitting}
                  aria-required="true"
                  aria-invalid={Boolean(emailError)}
                  leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                  error={emailError || undefined}
                  className="bg-white"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full mt-2 font-medium"
                isLoading={isSubmitting}
                disabled={isSubmitting}
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                {isSubmitting ? 'Sending instructions...' : 'Send Reset Link'}
              </Button>

              {/* Back to Login Link */}
              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-amber-700 transition-colors focus:outline-hidden focus:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back to Sign In
                </Link>
              </div>
            </form>
          ) : (
            /* Success State (Non-enumerating confirmation) */
            <div className="text-center space-y-4 py-2 animate-in fade-in zoom-in-95 duration-200">
              <div className="inline-flex items-center justify-center p-3.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full mx-auto">
                <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-stone-900">Check your inbox</h2>
                <p className="text-xs text-stone-600 leading-relaxed max-w-sm mx-auto">
                  If an account exists for{' '}
                  <strong className="text-stone-900 font-medium">{email}</strong>, we have
                  dispatched a secure link to reset your password.
                </p>
              </div>

              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-left text-[11px] text-amber-900 leading-relaxed">
                <div className="font-semibold flex items-center gap-1.5 mb-1 text-amber-950">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                  Security Notice
                </div>
                The reset link is valid for <strong>60 minutes</strong> and can only be used once.
                If you don&apos;t see the email, please check your spam or quarantine folder.
              </div>

              <div className="space-y-2 pt-2">
                <Link href="/login" className="block w-full">
                  <Button variant="outline" className="w-full">
                    Return to Sign In
                  </Button>
                </Link>

                <button
                  type="button"
                  onClick={handleResetForm}
                  className="text-xs text-stone-500 hover:text-stone-800 transition-colors underline"
                >
                  Didn&apos;t receive it? Try another email
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Support Help Footer */}
        <div className="text-center">
          <p className="text-[11px] text-stone-400 flex items-center justify-center gap-1">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Locked out or need immediate assistance? Contact your corporate IT Helpdesk.
          </p>
        </div>
      </div>
    </main>
  );
}
