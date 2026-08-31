CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`file_type` text NOT NULL,
	`original_name` text NOT NULL,
	`object_key` text NOT NULL,
	`bytes` integer NOT NULL,
	`row_count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_imports_user_file_type` ON `imports` (`user_id`,`file_type`);--> statement-breakpoint
CREATE TABLE `mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`isin` text NOT NULL,
	`exchange` text DEFAULT '' NOT NULL,
	`currency` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mappings_user_listing` ON `mappings` (`user_id`,`isin`,`exchange`,`currency`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);