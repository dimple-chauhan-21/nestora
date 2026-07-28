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
import type { components } from '@nestora/types';
import { API_BASE_URL, DEVICE_ID } from './api-config';
import { GuardConsole } from './guard-console';

type GuardLoginResponse = components['schemas']['GuardLoginResponseDto'];

const PHONE_PATTERN = /^\+91[6-9]\d{9}$/;
const GATE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Step = 'phone' | 'otp' | 'authenticated';

interface Session {
  accessToken: string;
  phone: string;
}

/**
 * Real guard login (POST /guard/login), not the generic OTP-verify placeholder
 * this screen used before. §5.3/§1's eventual PIN/biometric session is still
 * a future upgrade — this reuses Module 1's OTP flow like every other login
 * in the app, per GuardLoginDto's own comment.
 *
 * `gateId` here is a plain typed UUID field, which is the honest dev-testable
 * stand-in for how a real kiosk would actually get its gate: §5's own
 * "Kiosk devices are provisioned/allow-listed by device ID" framing means a
 * real deployment pins gateId to the kiosk at provisioning time (a local
 * config file, not a per-login guard choice) — a guard at a real gate never
 * types a UUID. See session-store.ts for how/why JWT storage here differs
 * from apps/web's httpOnly cookie.
 */
export function App() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [gateId, setGateId] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void (async () => {
      const existing = await window.nestora.session.get();
      if (!existing) return;
      // A restored session's access token may be expired by relaunch time —
      // confirmed by the guard console's own dashboard fetch, not guessed
      // here. If it's dead, GuardConsole surfaces that as a real error state
      // (same "don't leave silent failures" standard as everywhere else),
      // not a silent bounce back to the login screen.
      setSession({ accessToken: existing.accessToken, phone: existing.phone });
      setStep('authenticated');
    })();
  }, []);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!PHONE_PATTERN.test(phone)) {
      setError('Enter a valid +91 phone number, e.g. +919876543210');
      return;
    }
    if (!GATE_ID_PATTERN.test(gateId)) {
      setError('Enter this kiosk\'s gate ID (a UUID — ask your admin if unsure).');
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
      const res = await fetch(`${API_BASE_URL}/api/v1/guard/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, otp, deviceId: DEVICE_ID, gateId }),
      });
      const body: GuardLoginResponse | { message?: string | string[] } | null = await res.json().catch(() => null);
      if (!res.ok || !body || !('accessToken' in body)) {
        const message = body && 'message' in body ? body.message : undefined;
        setError(typeof message === 'string' ? message : 'Incorrect code, or this gate is not in your society.');
        return;
      }

      await window.nestora.session.set({
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        expiresIn: body.expiresIn,
        phone,
      });

      setSession({ accessToken: body.accessToken, phone });
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

  async function handleLogout() {
    await window.nestora.session.clear();
    setSession(null);
    setStep('phone');
    setPhone('');
    setGateId('');
    setOtp('');
  }

  if (step === 'authenticated' && session) {
    return <GuardConsole accessToken={session.accessToken} phone={session.phone} onLogout={handleLogout} />;
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
              <FormField label="Gate ID" htmlFor="gateId">
                <Input
                  type="text"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={gateId}
                  onChange={(e) => setGateId(e.target.value)}
                  disabled={loading}
                />
              </FormField>
              <p className="text-xs text-muted-foreground">
                In a real deployment this kiosk is pre-provisioned with its own gate — you wouldn&apos;t type this.
              </p>
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
