'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Spinner,
  Alert,
  AlertDescription,
} from '@nestora/ui';

const PHONE_PATTERN = /^\+91[6-9]\d{9}$/;
const DEVICE_ID_STORAGE_KEY = 'nestora_device_id';

/** Stable per-browser-install identifier the backend's OTP flow expects — not identity, just a device label. */
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

type Step = 'phone' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!PHONE_PATTERN.test(phone)) {
      setError('Enter a valid +91 phone number, e.g. +919876543210');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.message === 'string' ? body.message : 'Could not send OTP. Try again.');
        return;
      }
      setStep('otp');
    } catch {
      setError('Network error — is the API reachable?');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, otp, deviceId: getDeviceId() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.message === 'string' ? body.message : 'Incorrect or expired code. Try again.');
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Network error — is the API reachable?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Nestora</CardTitle>
          <CardDescription>
            {step === 'phone'
              ? "We'll send a one-time code to verify your phone."
              : `Enter the code sent to ${phone}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4" data-testid="phone-step">
              <FormField label="Phone number" htmlFor="phone">
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </FormField>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Spinner />}
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4" data-testid="otp-step">
              <FormField label="6-digit code" htmlFor="otp">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </FormField>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Spinner />}
                Verify
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                  setError(null);
                }}
              >
                Use a different number
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
