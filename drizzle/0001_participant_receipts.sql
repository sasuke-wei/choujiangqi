ALTER TABLE people ADD COLUMN receipt text;
--> statement-breakpoint
CREATE UNIQUE INDEX receipt_per_event ON people (event, receipt);
