import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('No authenticated user on request');

    if (!this.hasPermission(user.permissions, required)) {
      throw new ForbiddenException(`Missing required permission: ${required}`);
    }
    return true;
  }

  /**
   * `<module>:manage` satisfies any `<module>:<action>` requirement — "manage
   * = full CRUD within a role's scope" (seed-data convention). Avoids having
   * to grant both `:manage` and `:read` etc. to the same role.
   */
  private hasPermission(granted: string[], required: string): boolean {
    if (granted.includes(required)) return true;
    const [module] = required.split(':');
    return granted.includes(`${module}:manage`);
  }
}
