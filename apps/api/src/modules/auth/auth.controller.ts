import { Body, Controller, Post, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { PasswordForgotDto } from './dto/password-forgot.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { RequestContext } from './auth.service';

function requestContext(req: Request): RequestContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: Array.isArray(ua) ? (ua[0] ?? null) : (ua ?? null),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async otpRequest(@Body() dto: OtpRequestDto): Promise<{ status: string }> {
    await this.authService.requestOtp(dto.phone, dto.purpose ?? 'login');
    return { status: 'sent' };
  }

  @Public()
  @Post('otp/verify')
  async otpVerify(@Body() dto: OtpVerifyDto, @Req() req: Request) {
    return this.authService.verifyOtp(dto.phone, dto.otp, dto.deviceId, requestContext(req));
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.loginWithPassword(
      dto.email,
      dto.password,
      dto.deviceId,
      requestContext(req),
    );
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(dto.refreshToken, user.userId, dto.allDevices ?? false);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async passwordForgot(@Body() dto: PasswordForgotDto): Promise<{ status: string }> {
    await this.authService.requestPasswordReset(dto.phone);
    return { status: 'sent' };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async passwordReset(@Body() dto: PasswordResetDto): Promise<void> {
    await this.authService.resetPassword(dto.phone, dto.otp, dto.newPassword);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }
}
