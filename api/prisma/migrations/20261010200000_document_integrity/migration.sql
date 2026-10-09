-- Concurrent uploads must not create duplicate active originals for one owner.
-- A partial index preserves the ability to upload a previously deleted file.
CREATE UNIQUE INDEX "Document_owner_active_hash_key"
ON "Document" ("ownerId", "hash") WHERE "deleted_at" IS NULL;

CREATE INDEX "Document_ownerId_deleted_at_created_at_idx"
ON "Document" ("ownerId", "deleted_at", "created_at");
CREATE INDEX "Document_ownerId_hash_idx" ON "Document" ("ownerId", "hash");
