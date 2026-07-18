import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Marks a route as requiring a `module:action` permission (e.g. 'visitor:approve').
 * Checked by PermissionGuard against the resolved permissions embedded in the
 * caller's access token.
 */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
