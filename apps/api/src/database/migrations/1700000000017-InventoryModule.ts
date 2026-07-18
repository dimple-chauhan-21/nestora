import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 15 tables. `assigned_to (staff_id/location)` from §6's column
 * note is split into two nullable columns — `assigned_to_staff_id` (no hard
 * FK: could be domestic staff or a security guard, and Module 15's own
 * purpose text is explicit that assets are tracked separately from both
 * people-tables, so a soft reference avoids picking one FK target over the
 * other) and `assigned_to_location` (free text, per "a location rather than
 * a single custodian" in §6's Edge Cases).
 *
 * Purchase-cost visibility (`assets.purchase_cost`,
 * `asset_maintenance_log.cost`) is gated by permission grants only, not a
 * field-filtering mechanism — see roles.seed-data.ts's comment on
 * `inventory:manage`/`inventory:read`, reusing billing's own grant-shaped
 * pattern rather than a new scope-check like domestic-staff's police-
 * verification gating.
 */
export class InventoryModule1700000000017 implements MigrationInterface {
  name = 'InventoryModule1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50),
        purchase_date DATE,
        purchase_cost NUMERIC(12,2) CHECK (purchase_cost >= 0),
        vendor VARCHAR(255),
        warranty_expires_at DATE,
        assigned_to_staff_id UUID,
        assigned_to_location VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_asset_status CHECK (status IN ('active', 'under_repair', 'retired'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_assets_society_category ON assets(society_id, category) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_assets_warranty ON assets(society_id, warranty_expires_at) WHERE warranty_expires_at IS NOT NULL;`,
    );
    await queryRunner.query(`ALTER TABLE assets ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON assets
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE asset_maintenance_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        asset_id UUID NOT NULL REFERENCES assets(id),
        service_date DATE NOT NULL,
        cost NUMERIC(12,2) CHECK (cost >= 0),
        vendor VARCHAR(255),
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_asset_maintenance_log_asset ON asset_maintenance_log(asset_id, service_date DESC);`,
    );
    await queryRunner.query(`ALTER TABLE asset_maintenance_log ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON asset_maintenance_log
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS asset_maintenance_log;`);
    await queryRunner.query(`DROP TABLE IF EXISTS assets;`);
  }
}
