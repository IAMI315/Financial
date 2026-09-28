CREATE TABLE `daily_entry_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`category_id` integer NOT NULL,
	`subcategory_id` integer,
	`amount_mode` text DEFAULT 'latest' NOT NULL,
	`fixed_amount_fen` integer,
	`frequency` text DEFAULT 'daily' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subcategory_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "daily_entry_templates_type_check" CHECK("daily_entry_templates"."type" in ('income', 'expense')),
	CONSTRAINT "daily_entry_templates_amount_mode_check" CHECK("daily_entry_templates"."amount_mode" in ('fixed', 'latest')),
	CONSTRAINT "daily_entry_templates_frequency_check" CHECK("daily_entry_templates"."frequency" = 'daily'),
	CONSTRAINT "daily_entry_templates_fixed_amount_check" CHECK("daily_entry_templates"."fixed_amount_fen" is null or "daily_entry_templates"."fixed_amount_fen" > 0)
);
--> statement-breakpoint
CREATE INDEX `daily_entry_templates_user_sort_idx` ON `daily_entry_templates` (`user_id`,`is_enabled`,`sort_order`);--> statement-breakpoint
CREATE INDEX `daily_entry_templates_category_idx` ON `daily_entry_templates` (`category_id`);--> statement-breakpoint
CREATE INDEX `daily_entry_templates_subcategory_idx` ON `daily_entry_templates` (`subcategory_id`);