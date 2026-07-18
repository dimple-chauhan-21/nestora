import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS } from './roles.seed-data';

/** Safe to re-run: upserts by unique `code` / (role_id, permission_id) pair. */
async function seed(): Promise<void> {
  await AppDataSource.initialize();

  const roleRepo = AppDataSource.getRepository(Role);
  const permissionRepo = AppDataSource.getRepository(Permission);
  const rolePermissionRepo = AppDataSource.getRepository(RolePermission);

  const roleIdByCode = new Map<string, string>();
  for (const seed of ROLES) {
    let role = await roleRepo.findOne({ where: { code: seed.code } });
    if (!role) {
      role = roleRepo.create(seed);
      await roleRepo.save(role);
      console.log(`[seed] created role ${seed.code}`);
    } else if (role.name !== seed.name || role.tier !== seed.tier) {
      await roleRepo.update(role.id, { name: seed.name, tier: seed.tier });
      console.log(`[seed] updated role ${seed.code}`);
    }
    roleIdByCode.set(seed.code, role.id);
  }

  const permissionIdByCode = new Map<string, string>();
  for (const seed of PERMISSIONS) {
    let permission = await permissionRepo.findOne({ where: { code: seed.code } });
    if (!permission) {
      permission = permissionRepo.create(seed);
      await permissionRepo.save(permission);
      console.log(`[seed] created permission ${seed.code}`);
    } else if (permission.module !== seed.module || permission.action !== seed.action) {
      await permissionRepo.update(permission.id, { module: seed.module, action: seed.action });
      console.log(`[seed] updated permission ${seed.code}`);
    }
    permissionIdByCode.set(seed.code, permission.id);
  }

  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByCode.get(roleCode);
    if (!roleId) throw new Error(`Unknown role code in ROLE_PERMISSIONS: ${roleCode}`);

    for (const permissionCode of permissionCodes) {
      const permissionId = permissionIdByCode.get(permissionCode);
      if (!permissionId) {
        throw new Error(`Unknown permission code in ROLE_PERMISSIONS: ${permissionCode}`);
      }

      const existing = await rolePermissionRepo.findOne({
        where: { roleId, permissionId },
      });
      if (!existing) {
        await rolePermissionRepo.save(rolePermissionRepo.create({ roleId, permissionId }));
        console.log(`[seed] granted ${roleCode} -> ${permissionCode}`);
      }
    }
  }

  console.log(
    `[seed] done: ${ROLES.length} roles, ${PERMISSIONS.length} permissions, ${Object.values(
      ROLE_PERMISSIONS,
    ).reduce((n, list) => n + list.length, 0)} role_permission grants`,
  );

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
