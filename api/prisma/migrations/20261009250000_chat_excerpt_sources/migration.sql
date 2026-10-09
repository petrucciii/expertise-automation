ALTER TABLE "MessageSource"
ALTER COLUMN "documentId" DROP NOT NULL;

ALTER TABLE "MessageSource"
ADD COLUMN "case_document_id" UUID;

CREATE INDEX "MessageSource_case_document_id_idx"
ON "MessageSource"("case_document_id");

ALTER TABLE "MessageSource"
ADD CONSTRAINT "MessageSource_case_document_id_fkey"
FOREIGN KEY ("case_document_id") REFERENCES "case_documents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageSource"
ADD CONSTRAINT "MessageSource_exactly_one_source_check"
CHECK (("documentId" IS NULL) <> ("case_document_id" IS NULL));
