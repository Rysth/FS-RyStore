CREATE TABLE "branches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"hours" text,
	"phone" text,
	"whatsapp" text,
	"maps_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloadable_catalogs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_image_key" text,
	"file_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_branches" (
	"product_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_branches_product_id_branch_id_pk" PRIMARY KEY("product_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "about_title" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "about_body" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "contact_intro" text;--> statement-breakpoint
ALTER TABLE "product_branches" ADD CONSTRAINT "product_branches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_branches" ADD CONSTRAINT "product_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branches_active_idx" ON "branches" USING btree ("active");--> statement-breakpoint
CREATE INDEX "branches_position_idx" ON "branches" USING btree ("position");--> statement-breakpoint
CREATE INDEX "downloadable_catalogs_active_idx" ON "downloadable_catalogs" USING btree ("active");--> statement-breakpoint
CREATE INDEX "downloadable_catalogs_position_idx" ON "downloadable_catalogs" USING btree ("position");--> statement-breakpoint
CREATE INDEX "product_branches_branch_id_idx" ON "product_branches" USING btree ("branch_id");