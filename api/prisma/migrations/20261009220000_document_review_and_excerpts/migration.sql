ALTER TABLE "Document"
ADD COLUMN "extraction_reviewed_by_id" INTEGER,
ADD COLUMN "extraction_reviewed_at" TIMESTAMP(3),
ADD COLUMN "extraction_truncated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "case_documents"
ADD COLUMN "excerpt_text" TEXT;

CREATE INDEX "Document_extraction_reviewed_by_id_idx"
ON "Document"("extraction_reviewed_by_id");

ALTER TABLE "Document"
ADD CONSTRAINT "Document_extraction_reviewed_by_id_fkey"
FOREIGN KEY ("extraction_reviewed_by_id") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
