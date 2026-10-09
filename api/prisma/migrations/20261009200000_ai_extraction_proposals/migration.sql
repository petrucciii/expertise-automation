CREATE TYPE "ExtractionProposalStatus" AS ENUM ('PENDING', 'REVIEWED', 'REJECTED');
CREATE TYPE "ExtractionSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "ExtractionSuggestionKind" AS ENUM ('FACT', 'EVENT');

CREATE TABLE "case_extraction_proposals" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "case_document_id" UUID NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "document_type" VARCHAR(80) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "prompt_version" VARCHAR(80) NOT NULL,
    "status" "ExtractionProposalStatus" NOT NULL DEFAULT 'PENDING',
    "open_questions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    CONSTRAINT "case_extraction_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_extraction_proposals_case_id_created_at_idx"
ON "case_extraction_proposals"("case_id", "created_at");
ALTER TABLE "case_extraction_proposals" ADD CONSTRAINT "case_extraction_proposals_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_extraction_proposals" ADD CONSTRAINT "case_extraction_proposals_case_document_id_fkey"
FOREIGN KEY ("case_document_id") REFERENCES "case_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_extraction_proposals" ADD CONSTRAINT "case_extraction_proposals_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_extraction_suggestions" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "kind" "ExtractionSuggestionKind" NOT NULL,
    "content" JSONB NOT NULL,
    "status" "ExtractionSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "case_evidence_id" UUID,
    "case_event_id" UUID,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_extraction_suggestions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_extraction_suggestions_case_evidence_id_key"
ON "case_extraction_suggestions"("case_evidence_id");
CREATE UNIQUE INDEX "case_extraction_suggestions_case_event_id_key"
ON "case_extraction_suggestions"("case_event_id");
CREATE INDEX "case_extraction_suggestions_proposal_id_status_idx"
ON "case_extraction_suggestions"("proposal_id", "status");
ALTER TABLE "case_extraction_suggestions" ADD CONSTRAINT "case_extraction_suggestions_proposal_id_fkey"
FOREIGN KEY ("proposal_id") REFERENCES "case_extraction_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_extraction_suggestions" ADD CONSTRAINT "case_extraction_suggestions_case_evidence_id_fkey"
FOREIGN KEY ("case_evidence_id") REFERENCES "case_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_extraction_suggestions" ADD CONSTRAINT "case_extraction_suggestions_case_event_id_fkey"
FOREIGN KEY ("case_event_id") REFERENCES "case_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_extraction_suggestions" ADD CONSTRAINT "case_extraction_suggestions_reviewed_by_id_fkey"
FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
