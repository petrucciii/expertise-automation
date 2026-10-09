import { apiClient, download } from './api-client';
import type {
  Artifact,
  ArtifactType,
  AttachSourceInput,
  CalculationInput,
  CaseInput,
  CaseRecord,
  CaseSource,
  CaseSummary,
  ChatInput,
  ChatRecord,
  ChatReply,
  ChatSummary,
  DocumentContent,
  DocumentRecord,
  DocumentRegisterEntry,
  Evidence,
  EvidenceInput,
  EventInput,
  IssueInput,
  JsonObject,
  Proposal,
  User,
} from './types';

const part = encodeURIComponent;
const casePath = (id: string) => `/cases/${part(id)}`;
const artifactPath = (id: string, type: ArtifactType) =>
  `${casePath(id)}/artifacts/${type}`;
export const api = {
  me: () => apiClient.request<User>('/auth/me'),
  register: (email: string, password: string) =>
    apiClient.request<User>('/auth/register', {
      method: 'POST',
      auth: false,
      body: { email, password },
    }),
  cases: (offset = 0) =>
    apiClient.request<CaseSummary[]>(`/cases?limit=50&offset=${offset}`),
  case: (id: string) => apiClient.request<CaseRecord>(casePath(id)),
  createCase: (body: CaseInput) =>
    apiClient.request<CaseRecord>('/cases', { method: 'POST', body }),
  updateCase: (id: string, body: Partial<CaseInput>) =>
    apiClient.request<CaseRecord>(casePath(id), { method: 'PATCH', body }),
  documents: (offset = 0) =>
    apiClient.request<DocumentRecord[]>(`/documents?limit=50&offset=${offset}`),
  upload: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiClient.request<DocumentRecord>('/documents/upload', {
      method: 'POST',
      body,
    });
  },
  content: (id: string) =>
    apiClient.request<DocumentContent>(`/documents/${part(id)}/content`),
  reviewContent: (id: string) =>
    apiClient.request<DocumentContent>(
      `/documents/${part(id)}/extraction-review`,
      { method: 'POST' },
    ),
  deleteDocument: (id: string) =>
    apiClient.request<void>(`/documents/${part(id)}`, { method: 'DELETE' }),
  downloadDocument: (document: Pick<DocumentRecord, 'id' | 'fileName'>) =>
    download(`/documents/${part(document.id)}/download`, document.fileName),
  attach: (id: string, body: AttachSourceInput) =>
    apiClient.request<CaseSource>(`${casePath(id)}/documents`, {
      method: 'POST',
      body,
    }),
  registerSources: (id: string) =>
    apiClient.request<DocumentRegisterEntry[]>(
      `${casePath(id)}/document-register`,
    ),
  addEvidence: (id: string, body: EvidenceInput) =>
    apiClient.request<Evidence>(`${casePath(id)}/evidence`, {
      method: 'POST',
      body,
    }),
  addEvent: (id: string, body: EventInput) =>
    apiClient.request<unknown>(`${casePath(id)}/events`, {
      method: 'POST',
      body,
    }),
  addIssue: (id: string, body: IssueInput) =>
    apiClient.request<unknown>(`${casePath(id)}/issues`, {
      method: 'POST',
      body,
    }),
  updateIssue: (id: string, issueId: string, body: Partial<IssueInput>) =>
    apiClient.request<unknown>(`${casePath(id)}/issues/${part(issueId)}`, {
      method: 'PATCH',
      body,
    }),
  calculate: (id: string, code: string, body: CalculationInput) =>
    apiClient.request<{ evidence: Evidence }>(
      `${casePath(id)}/documents/${part(code)}/calculations`,
      { method: 'POST', body },
    ),
  extract: (id: string, code: string) =>
    apiClient.request<Proposal>(
      `${casePath(id)}/documents/${part(code)}/extract`,
      { method: 'POST' },
    ),
  proposals: (id: string, offset = 0) =>
    apiClient.request<Proposal[]>(
      `${casePath(id)}/extractions?limit=50&offset=${offset}`,
    ),
  accept: (id: string, proposalId: string, suggestionIds: string[]) =>
    apiClient.request<Proposal>(
      `${casePath(id)}/extractions/${part(proposalId)}/accept`,
      { method: 'POST', body: { suggestionIds } },
    ),
  reject: (id: string, proposalId: string) =>
    apiClient.request<Proposal>(
      `${casePath(id)}/extractions/${part(proposalId)}/reject`,
      { method: 'POST' },
    ),
  chats: (caseId: string, offset = 0) =>
    apiClient.request<ChatSummary[]>(
      `/chats?caseId=${part(caseId)}&limit=50&offset=${offset}`,
    ),
  chat: (id: string, offset = 0) =>
    apiClient.request<ChatRecord>(
      `/chats/${part(id)}?limit=50&offset=${offset}`,
    ),
  chatDocuments: (id: string) =>
    apiClient.request<CaseSource[]>(`/chats/${part(id)}/documents`),
  createChat: (caseId: string, body: ChatInput) =>
    apiClient.request<ChatReply>('/chats', {
      method: 'POST',
      body: { caseId, ...body },
    }),
  sendMessage: (id: string, body: ChatInput) =>
    apiClient.request<ChatReply>(`/chats/${part(id)}/messages`, {
      method: 'POST',
      body,
    }),
  deleteChat: (id: string) =>
    apiClient.request<void>(`/chats/${part(id)}`, { method: 'DELETE' }),
  artifacts: (id: string) =>
    apiClient.request<Artifact[]>(`${casePath(id)}/artifacts`),
  generateAll: (id: string) =>
    apiClient.request<Artifact[]>(`${casePath(id)}/artifacts/generate`, {
      method: 'POST',
    }),
  generateArtifact: (
    id: string,
    type: ArtifactType,
    body: { enhanced?: boolean; targetSection?: string } = {},
  ) =>
    apiClient.request<Artifact>(`${artifactPath(id, type)}/generate`, {
      method: 'POST',
      body,
    }),
  latestArtifact: (id: string, type: ArtifactType) =>
    apiClient.request<Artifact>(`${artifactPath(id, type)}/latest`),
  versions: (id: string, type: ArtifactType, offset = 0) =>
    apiClient.request<Artifact[]>(
      `${artifactPath(id, type)}/versions?limit=50&offset=${offset}`,
    ),
  saveRevision: (
    id: string,
    type: ArtifactType,
    content: JsonObject,
    expectedArtifactId: string,
  ) =>
    apiClient.request<Artifact>(`${artifactPath(id, type)}/revisions`, {
      method: 'POST',
      body: { content, expectedArtifactId },
    }),
  approve: (id: string, artifactId: string) =>
    apiClient.request<Artifact>(
      `${casePath(id)}/artifacts/${part(artifactId)}/approve`,
      { method: 'PATCH' },
    ),
  exportArtifact: (id: string, type: ArtifactType) =>
    download(
      `${artifactPath(id, type)}/latest/export`,
      `${type.toLowerCase()}.${type === 'STRUCTURED_CASE' ? 'json' : type === 'DOCUMENT_REGISTER' ? 'xlsx' : 'docx'}`,
    ),
};
