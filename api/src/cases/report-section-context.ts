import type { Prisma } from '../generated/prisma/client.js';

type ArtifactReader = Pick<Prisma.TransactionClient, 'caseArtifact'>;

/** Keep a snapshot of the current manual section; obsolete prose is never model evidence. */
export async function readReportSection(
  reader: ArtifactReader,
  caseId: string,
  caseRevision: number,
  sectionId: string,
) {
  const latest = await reader.caseArtifact.findFirst({
    where: { caseId, type: 'SURVEY_REPORT_DRAFT' },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, caseRevision: true, content: true },
  });
  const content = latest?.content;
  const isCurrent = latest?.caseRevision === caseRevision;
  const sections =
    isCurrent &&
    typeof content === 'object' &&
    content !== null &&
    !Array.isArray(content) &&
    Array.isArray(content.sections)
      ? content.sections
      : [];
  return {
    artifactId: latest?.id ?? null,
    version: latest?.version ?? null,
    caseRevision: latest?.caseRevision ?? null,
    isStale: Boolean(latest && !isCurrent),
    section:
      sections.find(
        (section) =>
          typeof section === 'object' &&
          section !== null &&
          !Array.isArray(section) &&
          section.id === sectionId,
      ) ?? null,
  };
}
