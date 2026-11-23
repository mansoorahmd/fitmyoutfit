import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261123044128 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fit_kit_refund" ("id" text not null, "order_id" text not null, "quantity" integer not null, "amount" text not null, "currency_code" text not null, "method" text check ("method" in ('medusa', 'by_hand')) not null, "payment_id" text null, "actor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fit_kit_refund_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fit_kit_refund_deleted_at" ON "fit_kit_refund" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fit_kit_refund_order_id" ON "fit_kit_refund" ("order_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fit_kit_refund" cascade;`);
  }

}
