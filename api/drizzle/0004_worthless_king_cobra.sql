CREATE TABLE "cash_registers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"business_date" date NOT NULL,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"opening_amount" numeric(10, 2) DEFAULT '0.0' NOT NULL,
	"closing_amount" numeric(10, 2),
	"expected_cash" numeric(10, 2),
	"cash_total" numeric(10, 2),
	"transfer_total" numeric(10, 2),
	"card_total" numeric(10, 2),
	"platform_total" numeric(10, 2),
	"total_sales" numeric(10, 2),
	"difference" numeric(10, 2),
	"orders_count" integer,
	"orders_paid_count" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_registers_status_valid" CHECK ("cash_registers"."status" in ('open', 'closed')),
	CONSTRAINT "cash_registers_opening_amount_non_negative" CHECK ("cash_registers"."opening_amount" >= 0),
	CONSTRAINT "cash_registers_closing_amount_non_negative" CHECK ("cash_registers"."closing_amount" is null or "cash_registers"."closing_amount" >= 0),
	CONSTRAINT "cash_registers_closed_fields_present" CHECK ("cash_registers"."status" <> 'closed' or ("cash_registers"."closed_by" is not null and "cash_registers"."closed_at" is not null and "cash_registers"."closing_amount" is not null and "cash_registers"."expected_cash" is not null and "cash_registers"."cash_total" is not null and "cash_registers"."transfer_total" is not null and "cash_registers"."total_sales" is not null and "cash_registers"."difference" is not null))
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"payment_id" bigint NOT NULL,
	"order_item_id" bigint NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_items_amount_positive" CHECK ("payment_items"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"cash_register_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"payment_method" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"received_amount" numeric(10, 2),
	"reference" text,
	"receipt_key" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_method_valid" CHECK ("payments"."payment_method" in ('cash', 'transfer', 'card', 'platform')),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_received_amount_valid" CHECK (("payments"."payment_method" = 'cash' and ("payments"."received_amount" is null or "payments"."received_amount" >= "payments"."amount")) or ("payments"."payment_method" <> 'cash' and "payments"."received_amount" is null))
);
--> statement-breakpoint
CREATE TABLE "restaurant_order_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"product_id" bigint,
	"product_name" text NOT NULL,
	"unit_price" numeric(10, 2) DEFAULT '0.0' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"removed_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extras_total" numeric(10, 2) DEFAULT '0.0' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0.0' NOT NULL,
	"notes" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_order_items_quantity_positive" CHECK ("restaurant_order_items"."quantity" > 0),
	CONSTRAINT "restaurant_order_items_payment_status_valid" CHECK ("restaurant_order_items"."payment_status" in ('pending', 'paid')),
	CONSTRAINT "restaurant_order_items_amounts_non_negative" CHECK ("restaurant_order_items"."unit_price" >= 0 and "restaurant_order_items"."extras_total" >= 0 and "restaurant_order_items"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "restaurant_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"number" integer,
	"business_date" date,
	"customer_name" varchar(60) NOT NULL,
	"channel" text DEFAULT 'local' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0.0' NOT NULL,
	"paid_amount" numeric(10, 2) DEFAULT '0.0' NOT NULL,
	"balance_amount" numeric(10, 2) DEFAULT '0.0' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"prep_seconds" integer,
	"delivery_seconds" integer,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"cash_register_id" bigint,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_orders_channel_valid" CHECK ("restaurant_orders"."channel" in ('local', 'whatsapp', 'rappi', 'pedidosya', 'self_order')),
	CONSTRAINT "restaurant_orders_status_valid" CHECK ("restaurant_orders"."status" in ('draft', 'preparing', 'ready', 'delivered', 'cancelled')),
	CONSTRAINT "restaurant_orders_payment_status_valid" CHECK ("restaurant_orders"."payment_status" in ('pending', 'partially_paid', 'paid')),
	CONSTRAINT "restaurant_orders_customer_name_present" CHECK (length(trim("restaurant_orders"."customer_name")) between 1 and 60),
	CONSTRAINT "restaurant_orders_amounts_consistent" CHECK ("restaurant_orders"."total_amount" >= 0 and "restaurant_orders"."paid_amount" >= 0 and "restaurant_orders"."balance_amount" >= 0 and "restaurant_orders"."balance_amount" = "restaurant_orders"."total_amount" - "restaurant_orders"."paid_amount"),
	CONSTRAINT "restaurant_orders_confirmed_fields_present" CHECK ("restaurant_orders"."status" = 'draft' or ("restaurant_orders"."number" is not null and "restaurant_orders"."business_date" is not null and "restaurant_orders"."confirmed_at" is not null and "restaurant_orders"."cash_register_id" is not null)),
	CONSTRAINT "restaurant_orders_ready_after_confirmed" CHECK ("restaurant_orders"."ready_at" is null or "restaurant_orders"."confirmed_at" is not null),
	CONSTRAINT "restaurant_orders_delivered_after_ready" CHECK ("restaurant_orders"."delivered_at" is null or "restaurant_orders"."ready_at" is not null),
	CONSTRAINT "restaurant_orders_cancelled_fields_present" CHECK ("restaurant_orders"."status" <> 'cancelled' or ("restaurant_orders"."cancelled_at" is not null and "restaurant_orders"."cancelled_by" is not null and length(trim("restaurant_orders"."cancel_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_order_item_id_restaurant_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."restaurant_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_restaurant_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."restaurant_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_order_id_restaurant_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."restaurant_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_registers_single_open_unique" ON "cash_registers" USING btree ("status") WHERE "cash_registers"."status" = 'open';--> statement-breakpoint
CREATE INDEX "cash_registers_business_date_idx" ON "cash_registers" USING btree ("business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_items_order_item_id_unique" ON "payment_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "payment_items_payment_id_idx" ON "payment_items" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_cash_register_id_idx" ON "payments" USING btree ("cash_register_id");--> statement-breakpoint
CREATE INDEX "restaurant_order_items_order_id_idx" ON "restaurant_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "restaurant_order_items_product_id_idx" ON "restaurant_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_orders_business_date_number_unique" ON "restaurant_orders" USING btree ("business_date","number") WHERE "restaurant_orders"."business_date" is not null and "restaurant_orders"."number" is not null;--> statement-breakpoint
CREATE INDEX "restaurant_orders_status_idx" ON "restaurant_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "restaurant_orders_payment_status_idx" ON "restaurant_orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "restaurant_orders_cash_register_id_idx" ON "restaurant_orders" USING btree ("cash_register_id");