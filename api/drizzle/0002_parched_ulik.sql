ALTER TABLE "customers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "featured";