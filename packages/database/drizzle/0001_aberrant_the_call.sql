DROP INDEX `transactions_user_type_idx`;--> statement-breakpoint
CREATE INDEX `transactions_user_type_time_idx` ON `transactions` (`user_id`,`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_user_category_time_idx` ON `transactions` (`user_id`,`category_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_user_subcategory_time_idx` ON `transactions` (`user_id`,`subcategory_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_duplicate_lookup_idx` ON `transactions` (`user_id`,`type`,`amount_fen`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_subcategory_idx` ON `transactions` (`subcategory_id`);