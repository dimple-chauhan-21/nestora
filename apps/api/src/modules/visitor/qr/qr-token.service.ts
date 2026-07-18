import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { loadEnv } from '../../../config/env.validation';

/**
 * QR pass signing — reuses @nestjs/jwt (same library as auth's RS256 access
 * tokens) but HS256 with its own secret, per SRS §4's explicit "signed
 * JWT-like tokens (HMAC)" security note. A guard's kiosk verifying a QR only
 * needs the shared secret, not the resident-auth asymmetric keypair — HS256
 * is the right tool here, not a second bespoke signing scheme.
 */
export interface QrTokenPayload {
  sub: string; // visitor_visits.id or guest_invites.id
  purpose: 'visitor_visit' | 'guest_invite';
}

const env = loadEnv();

@Injectable()
export class QrTokenService {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: QrTokenPayload, expiresInSeconds: number): string {
    return this.jwtService.sign(payload, {
      secret: env.QR_TOKEN_SECRET,
      algorithm: 'HS256',
      expiresIn: expiresInSeconds,
    });
  }

  verify(token: string): QrTokenPayload {
    try {
      return this.jwtService.verify<QrTokenPayload>(token, {
        secret: env.QR_TOKEN_SECRET,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired QR token');
    }
  }
}
