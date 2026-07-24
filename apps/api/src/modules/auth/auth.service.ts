import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { OtpService, OtpPurpose } from './otp.service';
import { RateLimiterService } from './rate-limiter.service';
import { TokenService, IssuedTokenPair } from './token.service';
import { PasswordService } from './password.service';
import { PermissionsService } from './permissions.service';
import { LoginAuditService } from './login-audit.service';
import type { AccessTokenPayload, AuthenticatedUser } from './types/authenticated-user.type';
import type { MeResponseDto } from './dto/me-response.dto';

const OTP_REQUEST_LIMIT = 5;
const OTP_REQUEST_WINDOW_SECONDS = 60 * 60;

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

const NO_CONTEXT: RequestContext = { ip: null, userAgent: null };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly otpService: OtpService,
    private readonly rateLimiter: RateLimiterService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
    private readonly permissionsService: PermissionsService,
    private readonly loginAudit: LoginAuditService,
  ) {}

  async requestOtp(phone: string, purpose: OtpPurpose): Promise<void> {
    const allowed = await this.rateLimiter.allow(
      `otp:request:${phone}`,
      OTP_REQUEST_LIMIT,
      OTP_REQUEST_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new HttpException('Too many OTP requests for this phone number', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.otpService.request(phone, purpose);
  }

  async verifyOtp(
    phone: string,
    otp: string,
    deviceId: string,
    ctx: RequestContext = NO_CONTEXT,
  ): Promise<IssuedTokenPair> {
    const result = await this.otpService.verify(phone, otp);

    if (result.outcome !== 'valid') {
      await this.loginAudit.record({
        userId: null,
        channel: 'otp',
        success: false,
        failureReason: result.outcome,
        ip: ctx.ip,
        device: ctx.userAgent,
      });
      this.otpService.assertValid(result);
    }

    let user = await this.users.findOne({ where: { phone } });
    if (!user) {
      user = this.users.create({ phone, status: 'pending_verification' });
      await this.users.save(user);
    } else if (user.status === 'pending_verification') {
      await this.users.update(user.id, {
        status: 'active',
        phoneVerifiedAt: new Date(),
      });
    }

    const tokens = await this.issueTokensFor(user.id, deviceId);

    await this.loginAudit.record({
      userId: user.id,
      channel: 'otp',
      success: true,
      ip: ctx.ip,
      device: ctx.userAgent,
    });

    return tokens;
  }

  async loginWithPassword(
    email: string,
    password: string,
    deviceId: string,
    ctx: RequestContext = NO_CONTEXT,
  ): Promise<IssuedTokenPair> {
    const user = await this.users.findOne({ where: { email } });

    if (!user || !user.passwordHash) {
      await this.loginAudit.record({
        userId: user?.id ?? null,
        channel: 'password',
        success: false,
        failureReason: 'invalid_credentials',
        ip: ctx.ip,
        device: ctx.userAgent,
      });
      throw new BadRequestException('Invalid email or password');
    }

    const valid = await this.passwordService.verify(user.passwordHash, password);
    if (!valid) {
      await this.loginAudit.record({
        userId: user.id,
        channel: 'password',
        success: false,
        failureReason: 'invalid_credentials',
        ip: ctx.ip,
        device: ctx.userAgent,
      });
      throw new BadRequestException('Invalid email or password');
    }

    const tokens = await this.issueTokensFor(user.id, deviceId);

    await this.loginAudit.record({
      userId: user.id,
      channel: 'password',
      success: true,
      ip: ctx.ip,
      device: ctx.userAgent,
    });

    return tokens;
  }

  async refresh(rawRefreshToken: string): Promise<IssuedTokenPair> {
    return this.tokenService.rotateRefreshTokenWithFreshPayload(rawRefreshToken, (userId) =>
      this.buildAccessTokenPayload(userId),
    );
  }

  async logout(rawRefreshToken: string | undefined, userId: string, allDevices: boolean): Promise<void> {
    if (allDevices) {
      await this.tokenService.revokeAllForUser(userId);
      return;
    }
    if (rawRefreshToken) {
      await this.tokenService.revokeByRawToken(rawRefreshToken);
    }
  }

  async me(userId: string): Promise<MeResponseDto> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    const access = await this.permissionsService.resolve(userId);
    return {
      user: { id: user.id, phone: user.phone, email: user.email, status: user.status },
      roles: access.roles,
      permissions: access.permissions,
      flatId: access.flatId,
      societyId: access.societyId,
    };
  }

  async requestPasswordReset(phone: string): Promise<void> {
    const user = await this.users.findOne({ where: { phone } });
    if (!user) return; // don't leak phone existence
    await this.requestOtp(phone, 'reset');
  }

  async resetPassword(phone: string, otp: string, newPassword: string): Promise<void> {
    const result = await this.otpService.verify(phone, otp);
    this.otpService.assertValid(result);

    const user = await this.users.findOne({ where: { phone } });
    if (!user) throw new BadRequestException('No account for this phone number');

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.users.update(user.id, { passwordHash });
    await this.tokenService.revokeAllForUser(user.id);
  }

  private async issueTokensFor(userId: string, deviceId: string): Promise<IssuedTokenPair> {
    const payload = await this.buildAccessTokenPayload(userId);
    return this.tokenService.issueTokenPair(userId, deviceId, payload);
  }

  private async buildAccessTokenPayload(userId: string): Promise<AccessTokenPayload> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    const access = await this.permissionsService.resolve(userId);
    return {
      sub: user.id,
      phone: user.phone,
      email: user.email,
      roles: access.roles,
      permissions: access.permissions,
      societyId: access.societyId,
      flatId: access.flatId,
      deviceId: '', // set by TokenService when embedding at issue/rotate time
    };
  }
}

export type { AuthenticatedUser };
