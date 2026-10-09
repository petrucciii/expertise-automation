import { describe, expect, it } from 'vitest';
import { validateCitations } from './chat.service.js';

describe('validateCitations', () => {
  const documents = [
    {
      id: 'doc-1',
      sourceCode: 'DOC-001',
      fileName: 'survey.pdf',
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
      sourceCode: 'DOC-002',
      fileName: 'bill.docx',
      text: 'Gross weight: 24,500 kg',
      pages: [],
    },
  ];

  it('accepts only excerpts that match the cited document and page', () => {
    const valid = validateCitations(
      [
        {
          documentId: 'doc-1',
          pageNumber: 2,
          excerpt: 'The tally recorded twenty four wrapped pallets.',
        },
        {
          documentId: 'doc-1',
          pageNumber: 1,
          excerpt: 'The tally recorded twenty four wrapped pallets.',
        },
        {
          documentId: 'doc-2',
          pageNumber: null,
          excerpt: 'Gross weight: 25,400 kg',
        },
        {
          documentId: 'unknown',
          pageNumber: null,
          excerpt: 'Any fabricated citation.',
        },
      ],
      documents,
    );

    expect(valid).toEqual([
      {
        documentId: 'doc-1',
        pageNumber: 2,
        excerpt: 'The tally recorded twenty four wrapped pallets.',
      },
    ]);
  });

  it('matches normalized whitespace while preserving the cited page', () => {
    const valid = validateCitations(
      [
        {
          documentId: 'doc-2',
          pageNumber: null,
          excerpt: 'Gross   weight:\n24,500 kg',
        },
      ],
      documents,
    );

    expect(valid).toHaveLength(1);
    expect(valid[0].pageNumber).toBeNull();
  });
});
