import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261122091851 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "team_order_email" drop constraint if exists "team_order_email_dedupe_key_unique";`);
    this.addSql(`create table if not exists "team_order_email" ("id" text not null, "team_order_id" text not null, "kind" text check ("kind" in ('proof_ready', 'deposit_due', 'balance_due', 'reminder_3d', 'reminder_1d')) not null, "dedupe_key" text not null, "status" text check ("status" in ('pending', 'sent', 'failed')) not null default 'pending', "attempts" integer not null default 0, "payload" jsonb not null, "last_error" text null, "last_attempt_at" timestamptz null, "sent_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "team_order_email_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_email_deleted_at" ON "team_order_email" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_team_order_email_dedupe_key_unique" ON "team_order_email" ("dedupe_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_email_team_order_id" ON "team_order_email" ("team_order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_email_status" ON "team_order_email" ("status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "team_order_step" ("id" text not null, "team_order_id" text not null, "step_name" text not null, "from_status" text check ("from_status" in ('draft', 'proof_sent', 'approved', 'deposit_paid', 'in_production', 'balance_due', 'shipped')) not null, "to_status" text check ("to_status" in ('draft', 'proof_sent', 'approved', 'deposit_paid', 'in_production', 'balance_due', 'shipped')) not null, "actor" text check ("actor" in ('organizer', 'admin', 'system')) not null, "actor_id" text null, "by_hand" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "team_order_step_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_step_deleted_at" ON "team_order_step" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_step_team_order_id" ON "team_order_step" ("team_order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "team_order" add column if not exists "kind" text check ("kind" in ('order', 'add_on', 'reorder')) not null default 'order', add column if not exists "linked_order_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_order_linked_order_id" ON "team_order" ("linked_order_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "team_order_email" cascade;`);

    this.addSql(`drop table if exists "team_order_step" cascade;`);

    this.addSql(`drop index if exists "IDX_team_order_linked_order_id";`);
    this.addSql(`alter table if exists "team_order" drop column if exists "kind", drop column if exists "linked_order_id";`);
  }

}
