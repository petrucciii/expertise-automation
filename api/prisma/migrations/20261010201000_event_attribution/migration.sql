-- Preserve the author of reported events when an extraction suggestion is accepted.
ALTER TABLE "case_events" ADD COLUMN "attribution" VARCHAR(240);
