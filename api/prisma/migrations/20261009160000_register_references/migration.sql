ALTER TABLE "case_documents" ALTER COLUMN "document_id" DROP NOT NULL;
ALTER TABLE "case_documents" ADD COLUMN "display_name" VARCHAR(240);
ALTER TABLE "case_documents" DROP CONSTRAINT "case_documents_document_id_fkey";
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
