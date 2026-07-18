import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../database/entities/user-role.entity';
import { TenantConnectionService } from '../../common/tenant-connection/tenant-connection.service';

export interface ResolvedAccess {
  roles: string[];
  permissions: string[];
  societyId: string | null;
  flatId: string | null;
}

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    private readonly tenantConn: TenantConnectionService,
  ) {}

  /**
   * Resolves a user's effective roles + permissions across all their
   * user_roles assignments. A user with multiple flats/roles gets the union
   * of permissions; societyId/flatId on the token is the first assignment
   * (multi-society context-switching is out of scope for this phase — a
   * user acting across societies would need a per-request society header,
   * which the `society` module's endpoints will add when they exist).
   *
   * Called both mid-login (OTP verify, token refresh — no JWT/tenant scope
   * exists yet, since resolving THIS is what produces one) and for an
   * already-authenticated caller re-resolving their own access. Either way
   * it needs to see this user's OWN `user_roles` rows across every society
   * they belong to, which `user_roles`' RLS policy (migration
   * 1700000000019) allows via `app.current_user_id` — explicitly set here
   * rather than assumed from the ambient request scope, since at login time
   * there isn't one yet.
   */
  async resolve(userId: string): Promise<ResolvedAccess> {
    await this.tenantConn.setCurrentUserId(userId);

    const rows: Array<{ role_code: string; permission_code: string | null; society_id: string | null; flat_id: string | null }> =
      await this.userRoles
        .createQueryBuilder('ur')
        .innerJoin('roles', 'r', 'r.id = ur.role_id AND r.deleted_at IS NULL')
        .leftJoin('role_permissions', 'rp', 'rp.role_id = r.id AND rp.deleted_at IS NULL')
        .leftJoin('permissions', 'p', 'p.id = rp.permission_id AND p.deleted_at IS NULL')
        .select('r.code', 'role_code')
        .addSelect('p.code', 'permission_code')
        .addSelect('ur.society_id', 'society_id')
        .addSelect('ur.flat_id', 'flat_id')
        .where('ur.user_id = :userId AND ur.deleted_at IS NULL', { userId })
        .getRawMany();

    const roles = new Set<string>();
    const permissions = new Set<string>();
    let societyId: string | null = null;
    let flatId: string | null = null;

    for (const row of rows) {
      roles.add(row.role_code);
      if (row.permission_code) permissions.add(row.permission_code);
      if (societyId === null && row.society_id) societyId = row.society_id;
      if (flatId === null && row.flat_id) flatId = row.flat_id;
    }

    return {
      roles: [...roles],
      permissions: [...permissions],
      societyId,
      flatId,
    };
  }
}
