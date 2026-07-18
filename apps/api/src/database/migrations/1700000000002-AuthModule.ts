import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 1 tables. `user_roles` lives here (not in the baseline
 * migration) because its FK to `roles(id)` requires `roles` to exist first —
 * the SRS §10.3 DDL lists user_roles alongside users/flats, but that ordering
 * only works if roles/permissions are created before it, so we sequence
 * roles -> permissions -> role_permissions -> user_roles here.
 */
export class AuthModule1700000000002 implements MigrationInterface {
  name = 'AuthModule1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_role_tier CHECK (tier IN ('platform', 'company', 'society', 'unit'))
      );
    `);

    await queryRunner.query(`
      CREATE TABLE permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) NOT NULL UNIQUE,
        module VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_permissions_module ON permissions(module);`);

    await queryRunner.query(`
      CREATE TABLE role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role_id UUID NOT NULL REFERENCES roles(id),
        permission_id UUID NOT NULL REFERENCES permissions(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        UNIQUE (role_id, permission_id)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_role_permissions_role ON role_permissions(role_id) WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        role_id UUID NOT NULL REFERENCES roles(id),
        society_id UUID REFERENCES societies(id),
        flat_id UUID REFERENCES flats(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        UNIQUE (user_id, role_id, society_id, flat_id)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_user_roles_lookup ON user_roles(user_id, society_id) WHERE deleted_at IS NULL;`,
    );

    // RLS proof-of-pattern (§10.5) — permissive OR-branch for platform-tier
    // rows (society_id IS NULL) mirrors the "bypass role for platform/company
    // tier roles" note in §10.5; app sets app.is_platform_scope for those
    // sessions instead of app.current_society_id.
    await queryRunner.query(`ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON user_roles
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR (society_id IS NULL AND current_setting('app.is_platform_scope', true) = 'true')
        );
    `);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        token_hash CHAR(64) NOT NULL UNIQUE,
        device_id VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        replaced_by_id UUID REFERENCES refresh_tokens(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE otp_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(15) NOT NULL,
        otp_hash CHAR(64) NOT NULL,
        purpose VARCHAR(20) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        locked_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_otp_purpose CHECK (purpose IN ('login', 'signup', 'reset'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_otp_requests_phone ON otp_requests(phone, created_at DESC);`,
    );

    await queryRunner.query(`
      CREATE TABLE login_audit (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        channel VARCHAR(30) NOT NULL,
        ip INET,
        device TEXT,
        success BOOLEAN NOT NULL,
        failure_reason VARCHAR(100),
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, occurred_at)
      ) PARTITION BY RANGE (occurred_at);
    `);
    // Single catch-all partition for local/dev; pg_partman (SRS §10.4) would
    // manage monthly partitions in staging/prod.
    await queryRunner.query(`
      CREATE TABLE login_audit_default PARTITION OF login_audit DEFAULT;
    `);
    await queryRunner.query(`CREATE INDEX idx_login_audit_user ON login_audit(user_id, occurred_at DESC);`);

    // Insert-only enforcement: revoke UPDATE/DELETE from the app's runtime
    // role. No-op locally if that role doesn't exist yet (dev bootstraps as
    // the superuser); real environments provision app_write_role via
    // Terraform/RDS IAM and this grant becomes load-bearing there.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write_role') THEN
          REVOKE UPDATE, DELETE ON login_audit FROM app_write_role;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS login_audit_default;`);
    await queryRunner.query(`DROP TABLE IF EXISTS login_audit;`);
    await queryRunner.query(`DROP TABLE IF EXISTS otp_requests;`);
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens;`);
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON user_roles;`);
    await queryRunner.query(`ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_roles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles;`);
  }
}
