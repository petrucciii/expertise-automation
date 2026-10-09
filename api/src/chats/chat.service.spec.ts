import { describe, expect, it } from 'vitest';
import { validateCitations } from './chat.service.js';

describe('validateCitations', () => {
  const documents: Parameters<typeof validateCitations>[1] = [
    {
      id: 'doc-1',
      documentId: 'doc-1',
      caseDocumentId: null,
      sourceCode: 'DOC-001',
      fileName: 'survey.pdf',
      sourceMetadata: null,
      availability: 'ORIGINAL_ACCESSIBLE',
      extractionStatus: 'EXTRACTED',
      sourceTextType: 'EXTRACTED_DOCUMENT',
      extractionTruncated: false,
      contextTruncated: false,
      text: '',
      pages: [
        {
          pageNumber: 2,
          text: 'The tally recorded twenty four wrapped pallets.',
        },
      ],
    },
    {
      id: 'doc-2',
      documentId: 'doc-2',
      caseDocumentId: null,
      sourceCode: 'DOC-002',
      fileName: 'bill.docx',
      sourceMetadata: null,
      availability: 'ORIGINAL_ACCESSIBLE',
      extractionStatus: 'EXTRACTED',
      sourceTextType: 'EXTRACTED_DOCUMENT',
      extractionTruncated: false,
      contextTruncated: false,
      text: 'Gross weight: 24,500 kg',
      pages: [],
    },
    {
      id: 'case-doc-3',
      documentId: null,
      caseDocumentId: 'case-doc-3',
      sourceCode: 'DOC-003',
      fileName: 'Survey report excerpt',
      sourceMetadata: null,
      availability: 'EXCERPT_ONLY',
      extractionStatus: null,
      sourceTextType: 'REGISTERED_EXCERPT',
      extractionTruncated: false,
      contextTruncated: false,
      text: 'The survey report records damaged cartons.',
      pages: [],
    },
  ];

  it('accepts only excerpts that match the cited document and page', () => {
    const valid = validateCitations(
      [
        {
          sourceId: 'doc-1',
          pageNumber: 2,
          excerpt: 'The tally recorded twenty four wrapped pallets.',
        },
        {
          sourceId: 'doc-1',
          pageNumber: 1,
          excerpt: 'The tally recorded twenty four wrapped pallets.',
        },
        {
          sourceId: 'doc-2',
          pageNumber: null,
          excerpt: 'Gross weight: 25,400 kg',
        },
        {
          sourceId: 'unknown',
          pageNumber: null,
          excerpt: 'Any fabricated citation.',
        },
      ],
      documents,
    );

    expect(valid).toEqual([
      {
        documentId: 'doc-1',
        caseDocumentId: null,
        pageNumber: 2,
        excerpt: 'The tally recorded twenty four wrapped pallets.',
      },
    ]);
  });

  it('matches normalized whitespace while preserving the cited page', () => {
    const valid = validateCitations(
      [
        {
          sourceId: 'doc-2',
          pageNumber: null,
          excerpt: 'Gross   weight:\n24,500 kg',
        },
      ],
      documents,
    );

    expect(valid).toHaveLength(1);
    expect(valid[0].pageNumber).toBeNull();
  });

  it('accepts registered excerpts and links citations to their case source', () => {
    const valid = validateCitations(
      [
        {
          sourceId: 'case-doc-3',
          pageNumber: null,
          excerpt: 'The survey report records damaged cartons.',
        },
      ],
      documents,
    );

    expect(valid).toEqual([
      {
        documentId: null,
        caseDocumentId: 'case-doc-3',
        pageNumber: null,
        excerpt: 'The survey report records damaged cartons.',
      },
    ]);
  });
});
