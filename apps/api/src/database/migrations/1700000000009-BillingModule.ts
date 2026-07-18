import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 9 tables. `bills` uses the exact DDL from SRS §10.3 — including
 * `UNIQUE (flat_id, billing_period)`, which is what makes bill generation
 * idempotent at the DB level (deliverable #2: rely on the constraint, not
 * just an app-layer check).
 *
 * `ledger_entries.reverses_entry_id` is this session's addition beyond the
 * SRS's own column list — required to implement the append-only correction
 * pattern the SRS's own Security note demands ("corrections via reversing
 * entries, never edits"). Same precedent as move_events.override_reason
 * last-but-one session: the column doesn't exist in §6's table, but the
 * validation rule it encodes does.
 *
 * `payments.gateway_ref` is nullable + UNIQUE — multiple offline payments
 * (gateway_ref IS NULL) don't collide with each other (Postgres UNIQUE
 * permits multiple NULLs), but a real gateway_ref can never be reused,
 * which is exactly the idempotency guarantee the webhook path needs.
 */
export class BillingModule1700000000009 implements MigrationInterface {
  name = 'BillingModule1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE billing_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        formula_type VARCHAR(20) NOT NULL,
        rate NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
        late_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (late_fee_pct >= 0),
        grace_period_days INT NOT NULL DEFAULT 0 CHECK (grace_period_days >= 0),
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_billing_plan_formula CHECK (formula_type IN ('flat_rate', 'per_sqft', 'per_head'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_billing_plans_society ON billing_plans(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON billing_plans
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        billing_period DATE NOT NULL,
        amount_due NUMERIC(12,2) NOT NULL CHECK (amount_due >= 0),
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        due_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
        late_fee_applied NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (flat_id, billing_period),
        CONSTRAINT chk_bill_status CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue'))
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_bills_society_status ON bills(society_id, status);`);
    await queryRunner.query(`ALTER TABLE bills ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON bills
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE bill_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        bill_id UUID NOT NULL REFERENCES bills(id),
        description VARCHAR(255) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_bill_line_items_bill ON bill_line_items(bill_id);`);
    await queryRunner.query(`ALTER TABLE bill_line_items ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON bill_line_items
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        bill_id UUID NOT NULL REFERENCES bills(id),
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        method VARCHAR(20) NOT NULL,
        gateway_ref VARCHAR(100) UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reconciled BOOLEAN NOT NULL DEFAULT false,
        paid_at TIMESTAMPTZ,
        recorded_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_payment_method CHECK (method IN ('online', 'cash', 'cheque', 'bank_transfer')),
        CONSTRAINT chk_payment_status CHECK (status IN ('pending', 'success', 'failed', 'refunded'))
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_payments_bill ON payments(bill_id);`);
    await queryRunner.query(`CREATE INDEX idx_payments_society ON payments(society_id);`);
    await queryRunner.query(`ALTER TABLE payments ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON payments
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        payment_id UUID NOT NULL UNIQUE REFERENCES payments(id),
        receipt_number VARCHAR(50) NOT NULL UNIQUE,
        pdf_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON receipts
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        entry_type VARCHAR(20) NOT NULL,
        category VARCHAR(50) NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        reference_type VARCHAR(50) NOT NULL,
        reference_id UUID NOT NULL,
        entry_date DATE NOT NULL,
        reverses_entry_id UUID REFERENCES ledger_entries(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_ledger_entry_type CHECK (entry_type IN ('income', 'expense'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_ledger_entries_society_date ON ledger_entries(society_id, entry_date DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_ledger_entries_reference ON ledger_entries(reference_type, reference_id);`,
    );
    await queryRunner.query(`ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON ledger_entries
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
    // Append-only in practice, same posture as audit_logs (§12): no
    // UPDATE/DELETE grant for the app's runtime role. See that migration's
    // comment for why this is currently a structural no-op locally
    // (table-owner connection) — tracked in KNOWN_GAPS.md.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write_role') THEN
          REVOKE UPDATE, DELETE ON ledger_entries FROM app_write_role;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE discounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        bill_id UUID NOT NULL REFERENCES bills(id),
        type VARCHAR(50) NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        reason TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_discounts_bill ON discounts(bill_id);`);
    await queryRunner.query(`ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON discounts
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS discounts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_entries;`);
    await queryRunner.query(`DROP TABLE IF EXISTS receipts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS payments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS bill_line_items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS bills;`);
    await queryRunner.query(`DROP TABLE IF EXISTS billing_plans;`);
  }
}
