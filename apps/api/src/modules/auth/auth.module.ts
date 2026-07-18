import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/entities/role.entity';
import { Permission } from '../../database/entities/permission.entity';
import { RolePermission } from '../../database/entities/role-permission.entity';
import { UserRole } from '../../database/entities/user-role.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { OtpRequest } from '../../database/entities/otp-request.entity';
import { LoginAudit } from '../../database/entities/login-audit.entity';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { PermissionsService } from './permissions.service';
import { LoginAuditService } from './login-audit.service';
import { RateLimiterService } from './rate-limiter.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { redisProvider, RedisConnection } from './redis.provider';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { CLOCK, SystemClock } from '../../common/clock';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    TenantScopedTypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      RolePermission,
      UserRole,
      RefreshToken,
      OtpRequest,
      LoginAudit,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    PasswordService,
    PermissionsService,
    LoginAuditService,
    RateLimiterService,
    JwtStrategy,
    RedisConnection,
    redisProvider,
    { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [AuthService, TokenService, SMS_PROVIDER],
})
export class AuthModule {}
