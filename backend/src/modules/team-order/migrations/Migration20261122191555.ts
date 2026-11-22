import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261122191555 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "proof_approval" add column if not exists "order_id" text null, add column if not exists "deposit_collection_id" text null, add column if not exists "balance_collection_id" text null, add column if not exists "deposit_percentage" real null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_proof_approval_order_id" ON "proof_approval" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_proof_approval_deposit_collection_id" ON "proof_approval" ("deposit_collection_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_proof_approval_balance_collection_id" ON "proof_approval" ("balance_collection_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_proof_approval_order_id";`);
    this.addSql(`drop index if exists "IDX_proof_approval_deposit_collection_id";`);
    this.addSql(`drop index if exists "IDX_proof_approval_balance_collection_id";`);
    this.addSql(`alter table if exists "proof_approval" drop column if exists "order_id", drop column if exists "deposit_collection_id", drop column if exists "balance_collection_id", drop column if exists "deposit_percentage";`);
  }

}
