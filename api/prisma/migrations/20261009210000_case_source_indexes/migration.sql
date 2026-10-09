DROP INDEX IF EXISTS "case_artifacts_case_id_type_version_idx";
CREATE INDEX "case_events_case_document_id_idx" ON "case_events"("case_document_id");
CREATE INDEX "case_evidence_case_document_id_idx" ON "case_evidence"("case_document_id");
CREATE INDEX "case_issue_evidence_evidence_id_idx" ON "case_issue_evidence"("evidence_id");
CREATE INDEX "case_event_sources_case_document_id_idx" ON "case_event_sources"("case_document_id");
CREATE INDEX "case_evidence_sources_case_document_id_idx" ON "case_evidence_sources"("case_document_id");
CREATE INDEX "case_extraction_proposals_case_document_id_idx" ON "case_extraction_proposals"("case_document_id");
