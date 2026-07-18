import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readFileSync } from 'node:fs';
import type { AccessTokenPayload, AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ?? 'keys/jwt-public.pem';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: readFileSync(publicKeyPath, 'utf8'),
      algorithms: ['RS256'],
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      phone: payload.phone,
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
      societyId: payload.societyId,
      flatId: payload.flatId,
      deviceId: payload.deviceId,
    };
  }
}
