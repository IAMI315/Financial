CREATE TABLE `common_transaction_pins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`signature` text NOT NULL,
	`type` text NOT NULL,
	`amount_fen` integer NOT NULL,
	`category_id` integer NOT NULL,
	`subcategory_id` integer,
	`pinned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subcategory_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "common_transaction_pins_type_check" CHECK("common_transaction_pins"."type" in ('income', 'expense')),
	CONSTRAINT "common_transaction_pins_amount_positive_check" CHECK("common_transaction_pins"."amount_fen" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `common_transaction_pins_user_signature_uq` ON `common_transaction_pins` (`user_id`,`signature`);--> statement-breakpoint
CREATE INDEX `common_transaction_pins_user_time_idx` ON `common_transaction_pins` (`user_id`,`pinned_at`);