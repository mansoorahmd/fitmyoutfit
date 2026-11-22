import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261122071614 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "roster_entry" ("id" text not null, "team_order_id" text not null, "line_id" text not null, "position" integer not null, "product_id" text not null, "name" text not null default '', "number" text not null default '', "size" text not null default '', "count" integer not null default 1, "no_name" boolean not null default false, "no_number" boolean not null default false, "locked" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "roster_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_roster_entry_deleted_at" ON "roster_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_roster_entry_team_order_id_position" ON "roster_entry" ("team_order_id", "position") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "team_order" ("id" text not null, "customer_id" text not null, "team_name" text not null, "design_id" text not null, "design_version_id" text not null, "product_id" text not null, "region_id" text not null, "need_by_date" text null, "status" text check ("status" in ('draft', 'proof_sent', 'approved', 'deposit_paid', 'in_production', 'balance_due', 'shipped')) not null default 'draft', "prints_name" boolean not null, "prints_number" boolean not null, "list_version" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "team_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_deleted_at" ON "team_order" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_customer_id" ON "team_order" ("customer_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "roster_entry" cascade;`);

    this.addSql(`drop table if exists "team_order" cascade;`);
  }

}
