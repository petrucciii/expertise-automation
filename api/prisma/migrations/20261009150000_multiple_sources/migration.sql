DROP INDEX IF EXISTS "Chat_userId_idx";

CREATE TABLE "case_event_sources" (
    "event_id" UUID NOT NULL,
    "case_document_id" UUID NOT NULL,
    "page_number" INTEGER,
    "excerpt" TEXT,
    CONSTRAINT "case_event_sources_pkey" PRIMARY KEY ("event_id", "case_document_id")
);
ALTER TABLE "case_event_sources" ADD CONSTRAINT "case_event_sources_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "case_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_event_sources" ADD CONSTRAINT "case_event_sources_case_document_id_fkey"
FOREIGN KEY ("case_document_id") REFERENCES "case_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_evidence_sources" (
    "evidence_id" UUID NOT NULL,
    "case_document_id" UUID NOT NULL,
    "page_number" INTEGER,
    "excerpt" TEXT,
    CONSTRAINT "case_evidence_sources_pkey" PRIMARY KEY ("evidence_id", "case_document_id")
);
ALTER TABLE "case_evidence_sources" ADD CONSTRAINT "case_evidence_sources_evidence_id_fkey"
FOREIGN KEY ("evidence_id") REFERENCES "case_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_evidence_sources" ADD CONSTRAINT "case_evidence_sources_case_document_id_fkey"
FOREIGN KEY ("case_document_id") REFERENCES "case_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
