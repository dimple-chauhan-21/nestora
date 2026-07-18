import { Body, Controller, Post } from '@nestjs/common';
import { DeviceTokenService } from './device-token.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

/**
 * No @RequirePermission gate — any authenticated user registers a token
 * for their own account (`request.user`, not a body-supplied user id),
 * same posture as `/auth/me`. There's no mobile/web client yet, so this is
 * meant to be called manually via Swagger/Postman for testing.
 */
@Controller('users/me/device-tokens')
export class DeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post()
  register(@Body() dto: RegisterDeviceTokenDto, @CurrentUser() user: AuthenticatedUser) {
    return this.deviceTokenService.register(user.userId, dto);
  }
}
