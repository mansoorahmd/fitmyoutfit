import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112052313 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "cash_collection" drop constraint if exists "cash_collection_order_id_unique";`);
    this.addSql(`create table if not exists "cash_collection" ("id" text not null, "order_id" text not null, "slip_reference" text not null, "collected_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cash_collection_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cash_collection_order_id_unique" ON "cash_collection" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cash_collection_deleted_at" ON "cash_collection" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cash_collection" cascade;`);
  }

}
