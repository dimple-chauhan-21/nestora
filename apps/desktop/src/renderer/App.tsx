import { useEffect, useState, type FormEvent } from 'react';
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
import { formatRoleName } from '@nestora/utils';
import type { components } from '@nestora/types';

type MeResponse = components['schemas']['MeResponseDto'];

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000';
const PHONE_PATTERN = /^\+91[6-9]\d{9}$/;
const DEVICE_ID = 'guard-kiosk'; // one kiosk, one stable device id — no per-browser-install concept here

type Step = 'phone' | 'otp' | 'authenticated';

/**
 * Placeholder guard-login: same OTP flow as apps/web's /login, reusing
 * packages/ui. Real guard auth (§5.3/§1) is PIN/biometric — this proves
 * the desktop app can hit the real API and persist a session, nothing
 * more. See session-store.ts for how/why JWT storage here differs from
 * apps/web's httpOnly cookie: no browser, no cookie jar, but a kiosk's
 * physical accessibility means the session file itself needs to be
 * OS-keychain-encrypted (Electron's safeStorage), not just kept off the
 * DOM the way a cookie already is.
 */
export function App() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    void (async () => {
      const existing = await window.nestora.session.get();
      if (!existing) return;
      const meResult = await fetchMe(existing.accessToken);
      if (meResult) {
        setMe(meResult);
        setStep('authenticated');
      }
    })();
  }, []);

  async function fetchMe(accessToken: string): Promise<MeResponse | null> {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!PHONE_PATTERN.test(phone)) {
      setError('Enter a valid +91 phone number, e.g. +919876543210');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/otp/request`, {
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
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, otp, deviceId: DEVICE_ID }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setError(typeof body?.message === 'string' ? body.message : 'Incorrect or expired code. Try again.');
        return;
      }

      await window.nestora.session.set({
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        expiresIn: body.expiresIn,
        phone,
      });

      const meResult = await fetchMe(body.accessToken);
      setMe(meResult);
      setStep('authenticated');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes('safeStorage')
          ? 'Could not securely store the session on this device. Contact IT.'
          : 'Network error — is the API reachable?',
      );
    } finally {
      setLoading(false);
    }
  }

  if (step === 'authenticated' && me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Logged in as {me.user.phone}</CardTitle>
            <CardDescription>
              {me.roles.length > 0 ? me.roles.map(formatRoleName).join(', ') : 'No roles assigned yet'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Guard-kiosk placeholder — proves the desktop app reaches the real API and persists a
            session locally. Real PIN/biometric guard login is a future session.
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Guard sign-in</CardTitle>
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
            <form onSubmit={handleSendOtp} className="space-y-4">
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
            <form onSubmit={handleVerifyOtp} className="space-y-4">
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
