ALTER TABLE "documents"
ADD COLUMN "extraction_reviewed_by_id" INTEGER,
ADD COLUMN "extraction_reviewed_at" TIMESTAMP(3),
ADD COLUMN "extraction_truncated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "case_documents"
ADD COLUMN "excerpt_text" TEXT;

CREATE INDEX "documents_extraction_reviewed_by_id_idx"
ON "documents"("extraction_reviewed_by_id");

ALTER TABLE "documents"
ADD CONSTRAINT "documents_extraction_reviewed_by_id_fkey"
FOREIGN KEY ("extraction_reviewed_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
