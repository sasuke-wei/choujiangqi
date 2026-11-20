CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`student` text NOT NULL,
	`name` text NOT NULL,
	`suffix` text NOT NULL,
	`eligible` integer NOT NULL,
	FOREIGN KEY (`event`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_per_event` ON `people` (`event`,`student`);