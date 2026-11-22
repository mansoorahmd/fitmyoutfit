import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261122082020 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "proof_approval" drop constraint if exists "proof_approval_team_order_id_proof_number_unique";`);
    this.addSql(`create table if not exists "proof_approval" ("id" text not null, "team_order_id" text not null, "proof_number" integer not null, "status" text check ("status" in ('sent', 'signed', 'withdrawn', 'replaced')) not null default 'sent', "design_version_id" text not null, "list_version" integer not null, "snapshot_text" text not null, "snapshot_hash" text not null, "signed_by_customer_id" text null, "signed_name" text null, "signed_at" timestamptz null, "signed_ip" text null, "schedule_state" text null, "need_by_date" text null, "rush" boolean null, "promised_delivery_date" text null, "closed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "proof_approval_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_proof_approval_deleted_at" ON "proof_approval" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_proof_approval_team_order_id_proof_number_unique" ON "proof_approval" ("team_order_id", "proof_number") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "roster_entry" drop column if exists "locked";`);

    this.addSql(`alter table if exists "team_order" add column if not exists "rush_requested" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "proof_approval" cascade;`);

    this.addSql(`alter table if exists "roster_entry" add column if not exists "locked" boolean not null default false;`);

    this.addSql(`alter table if exists "team_order" drop column if exists "rush_requested";`);
  }

}
