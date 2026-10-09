CREATE TYPE "CaseFamily" AS ENUM ('CARGO_DAMAGE', 'CARGO_CONTAMINATION', 'SHORTAGE', 'TEMPERATURE_EXCURSION', 'OTHER');
CREATE TYPE "CaseStatus" AS ENUM ('INTAKE', 'IN_REVIEW', 'DRAFT', 'APPROVED');
CREATE TYPE "EvidenceStatus" AS ENUM ('OBSERVED', 'REPORTED', 'STATED_IN_DOCUMENT', 'CALCULATED', 'DISPUTED', 'UNKNOWN');
CREATE TYPE "DocumentAvailability" AS ENUM ('ORIGINAL_ACCESSIBLE', 'EXCERPT_ONLY', 'REFERENCED_NOT_ACCESSIBLE', 'NOT_PROVIDED');
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'EXTRACTED', 'NEEDS_REVIEW');
CREATE TYPE "EventDateType" AS ENUM ('EVENT', 'DOCUMENT', 'RECEIVED', 'UNKNOWN');
CREATE TYPE "ChecklistStatus" AS ENUM ('COMPLIANT', 'ISSUE_FOUND', 'NOT_VERIFIABLE', 'NOT_APPLICABLE');
CREATE TYPE "CaseArtifactType" AS ENUM ('STRUCTURED_CASE', 'DOCUMENT_REGISTER', 'PRELIMINARY_REVIEW', 'SURVEY_REPORT_DRAFT');
CREATE TYPE "ArtifactStatus" AS ENUM ('DRAFT', 'APPROVED');

ALTER TYPE "MessageRole" ADD VALUE 'ASSISTANT';

ALTER TABLE "Document"
ADD COLUMN "extracted_text" TEXT,
ADD COLUMN "extraction_status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "source_metadata" JSONB;

ALTER TABLE "Chat" ADD COLUMN "caseId" UUID;
CREATE INDEX "Chat_userId_updated_at_idx" ON "Chat"("userId", "updated_at");
CREATE INDEX "Chat_caseId_idx" ON "Chat"("caseId");

CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "internal_reference" VARCHAR(120),
    "public_reference" VARCHAR(160),
    "case_family" "CaseFamily" NOT NULL DEFAULT 'CARGO_DAMAGE',
    "status" "CaseStatus" NOT NULL DEFAULT 'INTAKE',
    "assignment" JSONB,
    "shipment" JSONB,
    "parties" JSONB,
    "damage_assessment" JSONB,
    "open_questions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "report_template_id" TEXT NOT NULL DEFAULT 'cargo_damage_general_it_v1',
    "cliche_set_version" TEXT,
    "next_document_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cases_owner_id_status_updated_at_idx" ON "cases"("owner_id", "status", "updated_at");
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "case_documents" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "source_code" VARCHAR(40) NOT NULL,
    "document_type" VARCHAR(80),
    "document_date" TIMESTAMP(3),
    "sender_or_author" VARCHAR(240),
    "availability" "DocumentAvailability" NOT NULL DEFAULT 'ORIGINAL_ACCESSIBLE',
    "metadata" JSONB,
    "attached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_documents_case_id_document_id_key" ON "case_documents"("case_id", "document_id");
CREATE UNIQUE INDEX "case_documents_case_id_source_code_key" ON "case_documents"("case_id", "source_code");
CREATE INDEX "case_documents_document_id_idx" ON "case_documents"("document_id");
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "date_type" "EventDateType" NOT NULL DEFAULT 'UNKNOWN',
    "epistemic_status" "EvidenceStatus" NOT NULL,
    "case_document_id" UUID,
    "page_number" INTEGER,
    "excerpt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_events_case_id_date_idx" ON "case_events"("case_id", "date");
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_document_id_fkey"
FOREIGN KEY ("case_document_id") REFERENCES "case_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_evidence" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "field_key" VARCHAR(160) NOT NULL,
    "value" JSONB NOT NULL,
    "unit" VARCHAR(40),
    "comparison_group" VARCHAR(160),
    "epistemic_status" "EvidenceStatus" NOT NULL,
    "attribution" VARCHAR(240),
    "case_document_id" UUID,
    "page_number" INTEGER,
    "excerpt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_evidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_evidence_case_id_field_key_comparison_group_idx" ON "case_evidence"("case_id", "field_key", "comparison_group");
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_document_id_fkey"
FOREIGN KEY ("case_document_id") REFERENCES "case_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_issues" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "rule_id" VARCHAR(120),
    "rule_version" VARCHAR(80),
    "status" "ChecklistStatus" NOT NULL,
    "severity" VARCHAR(40),
    "title" VARCHAR(240) NOT NULL,
    "explanation" TEXT NOT NULL,
    "suggested_check" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_issues_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_issues_case_id_status_idx" ON "case_issues"("case_id", "status");
ALTER TABLE "case_issues" ADD CONSTRAINT "case_issues_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_issue_evidence" (
    "issue_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    CONSTRAINT "case_issue_evidence_pkey" PRIMARY KEY ("issue_id", "evidence_id")
);
ALTER TABLE "case_issue_evidence" ADD CONSTRAINT "case_issue_evidence_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "case_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_issue_evidence" ADD CONSTRAINT "case_issue_evidence_evidence_id_fkey"
FOREIGN KEY ("evidence_id") REFERENCES "case_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_artifacts" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "type" "CaseArtifactType" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "model" VARCHAR(120),
    "prompt_version" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    CONSTRAINT "case_artifacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_artifacts_case_id_type_version_key" ON "case_artifacts"("case_id", "type", "version");
CREATE INDEX "case_artifacts_case_id_type_version_idx" ON "case_artifacts"("case_id", "type", "version");
ALTER TABLE "case_artifacts" ADD CONSTRAINT "case_artifacts_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_artifacts" ADD CONSTRAINT "case_artifacts_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
