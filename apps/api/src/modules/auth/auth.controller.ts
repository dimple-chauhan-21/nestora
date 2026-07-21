import { Body, Controller, Post, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { TokenPairResponseDto } from './dto/token-pair-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { RequestContext } from './auth.service';

function requestContext(req: Request): RequestContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: Array.isArray(ua) ? (ua[0] ?? null) : (ua ?? null),
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request an OTP for the given phone number (SMS-stubbed in dev — see KNOWN_GAPS.md)' })
  @ApiResponse({ status: 202, description: 'OTP generated and dispatched (console-logged in dev)' })
  async otpRequest(@Body() dto: OtpRequestDto): Promise<{ status: string }> {
    await this.authService.requestOtp(dto.phone, dto.purpose ?? 'login');
    return { status: 'sent' };
  }

  @Public()
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify an OTP and issue an access/refresh token pair' })
  @ApiResponse({ status: 201, type: TokenPairResponseDto })
  async otpVerify(@Body() dto: OtpVerifyDto, @Req() req: Request): Promise<TokenPairResponseDto> {
    return this.authService.verifyOtp(dto.phone, dto.otp, dto.deviceId, requestContext(req));
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Email/password login (issues an access/refresh token pair)' })
  @ApiResponse({ status: 201, type: TokenPairResponseDto })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<TokenPairResponseDto> {
    return this.authService.loginWithPassword(
      dto.email,
      dto.password,
      dto.deviceId,
      requestContext(req),
    );
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token for a fresh access/refresh token pair' })
  @ApiResponse({ status: 201, type: TokenPairResponseDto })
  async refresh(@Body() dto: RefreshDto): Promise<TokenPairResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token (or all of the caller\'s devices)' })
  async logout(@Body() dto: LogoutDto, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(dto.refreshToken, user.userId, dto.allDevices ?? false);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a password-reset OTP' })
  async passwordForgot(@Body() dto: PasswordForgotDto): Promise<{ status: string }> {
    await this.authService.requestPasswordReset(dto.phone);
    return { status: 'sent' };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a password using a verified OTP' })
  async passwordReset(@Body() dto: PasswordResetDto): Promise<void> {
    await this.authService.resetPassword(dto.phone, dto.otp, dto.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'The authenticated user, with resolved roles and permissions' })
  @ApiResponse({ status: 200, type: MeResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    return this.authService.me(user.userId);
  }
}
