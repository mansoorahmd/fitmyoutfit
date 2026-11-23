import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261123051202 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "design_request_email" drop constraint if exists "design_request_email_dedupe_key_unique";`);
    this.addSql(`alter table if exists "design_request" drop constraint if exists "design_request_reference_unique";`);
    this.addSql(`create table if not exists "design_request" ("id" text not null, "reference" text not null, "team_name" text not null, "contact_name" text not null, "email" text not null, "email_key" text not null, "phone" text null, "product" text null, "pieces" integer null, "need_by_date" text null, "region" text not null, "message" text not null, "reference_links" text[] not null default '{}', "customer_id" text null, "status" text check ("status" in ('new', 'in_progress', 'proof_sent', 'done')) not null default 'new', "staff_notes" text null, "assigned_to" text null, "ip_hash" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "design_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_deleted_at" ON "design_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_design_request_reference_unique" ON "design_request" ("reference") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_status" ON "design_request" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_email_key" ON "design_request" ("email_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_ip_hash" ON "design_request" ("ip_hash") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_customer_id" ON "design_request" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_created_at" ON "design_request" ("created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "design_request_email" ("id" text not null, "design_request_id" text not null, "kind" text check ("kind" in ('received')) not null, "dedupe_key" text not null, "status" text check ("status" in ('pending', 'sent', 'failed')) not null default 'pending', "attempts" integer not null default 0, "last_error" text null, "last_attempt_at" timestamptz null, "sent_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "design_request_email_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_email_deleted_at" ON "design_request_email" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_design_request_email_dedupe_key_unique" ON "design_request_email" ("dedupe_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_email_design_request_id" ON "design_request_email" ("design_request_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "design_request_step" ("id" text not null, "design_request_id" text not null, "from_status" text check ("from_status" in ('new', 'in_progress', 'proof_sent', 'done')) not null, "to_status" text check ("to_status" in ('new', 'in_progress', 'proof_sent', 'done')) not null, "actor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "design_request_step_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_step_deleted_at" ON "design_request_step" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_request_step_design_request_id" ON "design_request_step" ("design_request_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "design_request" cascade;`);

    this.addSql(`drop table if exists "design_request_email" cascade;`);

    this.addSql(`drop table if exists "design_request_step" cascade;`);
  }

}
