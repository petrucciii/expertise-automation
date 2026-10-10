import 'reflect-metadata';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test } from '@nestjs/testing';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorageService, getStorageToken } from '@nestjs/throttler';
import { PasswordHasher, TokenService } from '@nestjs/authentication';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import sharp from 'sharp';
import type { PrismaService } from '../dist/prisma/prisma.service.js';
import {
  cargoDocx,
  cargoPdf,
  claimEmail,
  europeanTemperatureCsv,
  sectorExamples,
  temperatureWorkbook,
} from './fixtures/cargo-documents.js';

const origin = 'http://localhost:5173';
const caseId = '019c64a2-301f-7000-8000-000000000001';
const resourceId = '019c64a2-301f-7000-8000-000000000002';
const password = 'Cargo-test-password-123';
type Method = 'get' | 'post' | 'patch' | 'delete';

// This inventory is also compared with Nest's discovered routes below.
const protectedRoutes: Array<[Method, string]> = [
  ['post', '/auth/logout-all'],
  ['get', '/auth/me'],
  ['post', '/cases'],
  ['get', '/cases'],
  ['get', `/cases/${caseId}`],
  ['patch', `/cases/${caseId}`],
  ['post', `/cases/${caseId}/documents`],
  ['get', `/cases/${caseId}/document-register`],
  ['post', `/cases/${caseId}/events`],
  ['post', `/cases/${caseId}/evidence`],
  ['post', `/cases/${caseId}/issues`],
  ['patch', `/cases/${caseId}/issues/${resourceId}`],
  ['post', '/documents/upload'],
  ['get', '/documents'],
  ['get', `/documents/${resourceId}/download`],
  ['get', `/documents/${resourceId}/content`],
  ['post', `/documents/${resourceId}/extraction-review`],
  ['delete', `/documents/${resourceId}`],
  ['post', '/chats'],
  ['post', '/chats/new'],
  ['get', '/chats'],
  ['get', `/chats/${resourceId}`],
  ['get', `/chats/${resourceId}/documents`],
  ['post', `/chats/${resourceId}/messages`],
  ['delete', `/chats/${resourceId}`],
  ['post', `/cases/${caseId}/artifacts/generate`],
  ['post', `/cases/${caseId}/artifacts/STRUCTURED_CASE/generate`],
  ['get', `/cases/${caseId}/artifacts`],
  ['get', `/cases/${caseId}/artifacts/STRUCTURED_CASE/latest`],
  ['get', `/cases/${caseId}/artifacts/STRUCTURED_CASE/versions`],
  ['post', `/cases/${caseId}/artifacts/SURVEY_REPORT_DRAFT/revisions`],
  ['get', `/cases/${caseId}/artifacts/STRUCTURED_CASE/latest/export`],
  ['patch', `/cases/${caseId}/artifacts/${resourceId}/approve`],
  ['post', `/cases/${caseId}/documents/DOC-001/calculations`],
  ['post', `/cases/${caseId}/documents/DOC-001/extract`],
  ['get', `/cases/${caseId}/extractions`],
  ['post', `/cases/${caseId}/extractions/${resourceId}/accept`],
  ['post', `/cases/${caseId}/extractions/${resourceId}/reject`],
];

describe('API with real PostgreSQL and the production Nest application', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let uploads: string;
  let userId: number;
  let otherId: number;
  let token: string;
  let otherToken: string;
  const savedEnv = { ...process.env };
  const fetchMock = vi.fn<typeof fetch>();

  beforeAll(async () => {
    uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'expertise-e2e-'));
    container = await new PostgreSqlContainer('postgres:18.6')
      .withDatabase('expertise_test')
      .withPassword(randomBytes(32).toString('hex'))
      .start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = randomBytes(48).toString('base64url');
    process.env.GEMINI_API_KEY = 'synthetic-test-key';
    process.env.DOCUMENT_STORAGE_DIR = uploads;
    process.env.FRONTEND_ORIGINS = origin;
    process.env.REFRESH_COOKIE_SAME_SITE = 'lax';
    process.env.NODE_ENV = 'test';
    await promisify(execFile)(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env: process.env, timeout: 60_000 },
    );
    // Tests import the compiled application so constructor and DTO metadata are real.
    const { AppModule } = await import('../dist/app.module.js');
    const { configureApp } = await import('../dist/configure-app.js');
    const { PrismaService: PrismaProvider } =
      await import('../dist/prisma/prisma.service.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaProvider);
    const hash = await app.get(PasswordHasher).hash(password);
    const first = await prisma.user.create({
      data: { email: 'owner@example.test', passwordHash: hash },
    });
    const second = await prisma.user.create({
      data: { email: 'other@example.test', passwordHash: hash },
    });
    userId = first.id;
    otherId = second.id;
    token = (
      await app.get(TokenService).issue(String(userId), { method: 'password' })
    ).accessToken;
    otherToken = (
      await app.get(TokenService).issue(String(otherId), { method: 'password' })
    ).accessToken;
    vi.stubGlobal('fetch', fetchMock);
  });

  beforeEach(() => {
    fetchMock.mockReset();
    app.get<ThrottlerStorageService>(getStorageToken()).onApplicationShutdown();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
    if (container) await container.stop();
    // The absolute target is a unique directory created by this test, never a user storage path.
    if (
      uploads &&
      path.dirname(uploads) === path.resolve(os.tmpdir()) &&
      path.basename(uploads).startsWith('expertise-e2e-')
    )
      await fs.rm(uploads, { recursive: true, force: true });
    for (const key of Object.keys(process.env))
      if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  });

  function api(method: Method, url: string, accessToken = token) {
    return request(app.getHttpServer())
      [method](`/api${url}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Origin', origin);
  }
  async function newCase(title = 'Synthetic cargo survey') {
    return (await api('post', '/cases').send({ title }).expect(201)).body as {
      id: string;
      revision: number;
    };
  }
  async function upload(buffer: Buffer, name: string) {
    return (
      await api('post', '/documents/upload')
        .attach('file', buffer, name)
        .expect(201)
    ).body as { id: string };
  }
  async function attachedCase(
    buffer: Buffer = Buffer.from(europeanTemperatureCsv),
    name = `temperature-${randomUUID()}.csv`,
  ) {
    const record = await newCase();
    const document = await upload(
      Buffer.concat([
        buffer,
        Buffer.from(name.endsWith('.csv') ? `\n# ${randomUUID()}\n` : ''),
      ]),
      name,
    );
    const source = (
      await api('post', `/cases/${record.id}/documents`)
        .send({ documentId: document.id })
        .expect(201)
    ).body as { id: string; sourceCode: string };
    return { record, document, source };
  }
  function modelResponse(value: unknown, status = 200) {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify(value) }] },
          },
        ],
      }),
      { status },
    );
  }

  it('exposes a minimal public health route with security and CORS headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', origin)
      .expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    const untrusted = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://attacker.example')
      .expect(200);
    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps the tested route inventory complete when a controller gains or changes a route', async () => {
    const modules = await Promise.all([
      import('../dist/app.controller.js'),
      import('../dist/auth/auth.controller.js'),
      import('../dist/cases/cases.controller.js'),
      import('../dist/cases/case-artifacts.controller.js'),
      import('../dist/cases/case-extraction.controller.js'),
      import('../dist/chats/chat.controller.js'),
      import('../dist/documents/document.controller.js'),
    ]);
    const discovered: string[] = [];
    for (const controllerModule of modules)
      for (const controller of Object.values(controllerModule)) {
        const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
        const prototype = controller.prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as
            RequestMethod | undefined;
          if (method === undefined) continue;
          const suffix = Reflect.getMetadata(PATH_METADATA, handler) as string;
          const url = `/${prefix}/${suffix}`
            .replace(/\/+/g, '/')
            .replace(/\/$/, '')
            .replace(/:[^/]+/g, ':id');
          discovered.push(`${RequestMethod[method].toLowerCase()} ${url}`);
        }
      }
    const tested = [
      ...protectedRoutes,
      ['get', '/health'],
      ['post', '/auth/register'],
      ['post', '/auth/login'],
      ['post', '/auth/refresh'],
      ['post', '/auth/logout'],
    ].map(
      ([method, url]) =>
        `${method} ${url
          .replaceAll(caseId, ':id')
          .replaceAll(resourceId, ':id')
          .replace(/\/(STRUCTURED_CASE|SURVEY_REPORT_DRAFT)(?=\/)/g, '/:id')
          .replace('/DOC-001/', '/:id/')}`,
    );
    expect(discovered.sort()).toEqual(tested.sort());
  });

  it('upgrades legacy bcrypt hashes and refuses refresh for a deleted account', async () => {
    const email = `legacy-${randomUUID()}@example.test`;
    const legacy = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 10) },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } }))
        .passwordHash,
    ).toMatch(/^\$scrypt\$/);
    await prisma.user.update({
      where: { id: legacy.id },
      data: { deleted_at: new Date() },
    });
    await api('get', '/auth/me', login.body.accessToken).expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', login.headers['set-cookie'][0])
      .expect(401);
  });

  it('detects concurrent refresh reuse, expires tokens, and revokes successors saved after logout', async () => {
    const pair = await app
      .get(TokenService)
      .issue(String(userId), { method: 'password' });
    const rotated = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', origin)
        .set('Cookie', `refresh_token=${pair.refreshToken}`),
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', origin)
        .set('Cookie', `refresh_token=${pair.refreshToken}`),
    ]);
    expect(
      rotated
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 401]);
    const winner = rotated.find((response) => response.status === 200)!;
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', winner.headers['set-cookie'][0])
      .expect(401);
    const expired = await app
      .get(TokenService)
      .issue(String(userId), { method: 'password' });
    await prisma.refreshToken.update({
      where: {
        id: createHash('sha256')
          .update(expired.refreshToken)
          .digest('base64url'),
      },
      data: { expiresAt: new Date(0) },
    });
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', `refresh_token=${expired.refreshToken}`)
      .expect(401);
    const { PrismaRefreshTokenStore } =
      await import('../dist/auth/prisma-refresh-token.store.js');
    const store = app.get(PrismaRefreshTokenStore);
    const active = await app
      .get(TokenService)
      .issue(String(userId), { method: 'password' });
    const predecessor = await store.getRefreshToken(
      createHash('sha256').update(active.refreshToken).digest('base64url'),
    );
    expect(predecessor).toBeDefined();
    await store.revokeRefreshTokenFamily(predecessor!.familyId);
    await store.saveRefreshToken({
      ...predecessor!,
      id: randomBytes(32).toString('hex'),
    });
    expect(await store.isRefreshTokenFamilyRevoked(predecessor!.familyId)).toBe(
      true,
    );
  });

  it.each([
    ['patch', '/cases/CASE', { title: ' ' }],
    ['patch', '/cases/CASE', { caseFamily: null }],
    ['patch', '/cases/CASE', { openQuestions: null }],
    [
      'patch',
      '/cases/CASE',
      { assignment: { requestedScope: Array(51).fill('x') } },
    ],
    [
      'post',
      '/cases/CASE/documents',
      { documentDate: '2026-02-30', availability: 'NOT_PROVIDED' },
    ],
    ['post', '/cases/CASE/events', { event: ' ', epistemicStatus: 'UNKNOWN' }],
    [
      'post',
      '/cases/CASE/events',
      { event: 'Test', epistemicStatus: 'UNKNOWN', sources: null },
    ],
    [
      'post',
      '/cases/CASE/evidence',
      { fieldKey: 'weight', value: 5, epistemicStatus: 'WRONG' },
    ],
    [
      'post',
      '/cases/CASE/issues',
      { title: 'Test', explanation: ' ', status: 'ISSUE_FOUND' },
    ],
    [
      'post',
      '/cases/CASE/artifacts/STRUCTURED_CASE/generate',
      { enhanced: 'true' },
    ],
    ['post', '/chats', { caseId, message: ' ' }],
  ] as Array<[Method, string, Record<string, unknown>]>)(
    'rejects invalid boundary input on %s %s',
    async (method, url, body) => {
      const record = await newCase();
      await api(method, url.replace('CASE', record.id)).send(body).expect(400);
    },
  );

  it('enforces source availability combinations, duplicate links, foreign documents and source codes', async () => {
    const { record, document, source } = await attachedCase();
    await api('post', `/cases/${record.id}/documents`)
      .send({ documentId: document.id })
      .expect(409);
    await api('post', `/cases/${record.id}/documents`)
      .send({ documentId: document.id, availability: 'NOT_PROVIDED' })
      .expect(400);
    await api('post', `/cases/${record.id}/documents`)
      .send({ availability: 'ORIGINAL_ACCESSIBLE' })
      .expect(400);
    await api('post', `/cases/${record.id}/documents`)
      .send({
        availability: 'REFERENCED_NOT_ACCESSIBLE',
        excerptText: 'Should use EXCERPT_ONLY',
      })
      .expect(400);
    const foreign = await api('post', '/documents/upload', otherToken)
      .attach(
        'file',
        Buffer.from(`a,b\n1,2\n#${randomUUID()}`),
        'other-owner.csv',
      )
      .expect(201);
    await api('post', `/cases/${record.id}/documents`)
      .send({ documentId: foreign.body.id })
      .expect(404);
    const fact = {
      fieldKey: 'shipment.weight',
      value: 5,
      epistemicStatus: 'STATED_IN_DOCUMENT',
    };
    await api('post', `/cases/${record.id}/evidence`)
      .send({ ...fact, sources: [{ sourceCode: 'DOC-999' }] })
      .expect(400);
    await api('post', `/cases/${record.id}/evidence`)
      .send({
        ...fact,
        sources: [
          { sourceCode: source.sourceCode },
          { sourceCode: source.sourceCode },
        ],
      })
      .expect(400);
    await api('get', '/documents?limit=101').expect(400);
    await api('get', '/documents?offset=-1').expect(400);
    await api('get', '/documents?unexpected=1').expect(400);
    await api('get', '/chats?limit=0').expect(400);
  });

  it('preserves distinct container loads and tally scope, flags only comparable weights, and keeps claim limits separate from loss', async () => {
    const record = await newCase('Synthetic maritime damage reconciliation');
    const source = await api('post', `/cases/${record.id}/documents`)
      .send({
        availability: 'EXCERPT_ONLY',
        documentType: 'court_order',
        excerptText:
          'Container A: 1080 cartons on 29 pallets. Container B: 894 cartons on 34 pallets. Tally: 24 pallets, scope unknown. Carrier invokes 31500 USD as a liability limit, not a damage valuation.',
      })
      .expect(201);
    for (const [fieldKey, value, unit, comparisonGroup] of [
      ['shipment.carton_count', 1080, 'cartons', 'container-a'],
      ['shipment.carton_count', 894, 'cartons', 'container-b'],
      ['shipment.pallet_count', 29, 'pallets', 'container-a'],
      ['shipment.pallet_count', 34, 'pallets', 'container-b'],
      ['shipment.pallet_count', 24, 'pallets', null],
      ['shipment.gross_weight', 24500, 'kg', 'gross-at-loading'],
      ['shipment.gross_weight', 24600, 'kg', 'gross-at-loading'],
      ['shipment.net_weight', 23000, 'kg', 'net-at-loading'],
      ['claim.liability_limit_position', 31500, 'USD', null],
    ])
      await api('post', `/cases/${record.id}/evidence`)
        .send({
          fieldKey,
          value,
          unit,
          comparisonGroup: comparisonGroup ?? undefined,
          epistemicStatus:
            fieldKey === 'claim.liability_limit_position'
              ? 'REPORTED'
              : 'STATED_IN_DOCUMENT',
          attribution:
            fieldKey === 'claim.liability_limit_position'
              ? 'Carrier'
              : undefined,
          sources: [{ sourceCode: source.body.sourceCode }],
        })
        .expect(201);
    const review = await api(
      'post',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/generate`,
    )
      .send({})
      .expect(201);
    expect(
      review.body.content.computedChecks.comparableValueDifferences,
    ).toHaveLength(1);
    expect(
      review.body.content.computedChecks.comparableValueDifferences[0].fieldKey,
    ).toBe('shipment.gross_weight');
    const structured = await api(
      'post',
      `/cases/${record.id}/artifacts/STRUCTURED_CASE/generate`,
    )
      .send({})
      .expect(201);
    expect(
      structured.body.content.shipment.containers.map(
        (item: { value: number }) => item.value,
      ),
    ).toEqual([1080, 894, 29, 34, 24]);
    const report = await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    const economic = report.body.content.sections.find(
      (section: { id: string }) => section.id === 'economic-assessment',
    );
    expect(economic.paragraphs.join(' ')).toContain('Carrier riferisce');
    expect(
      report.body.content.evidenceLedger.every(
        (item: { sources: unknown[] }) => item.sources.length > 0,
      ),
    ).toBe(true);
    await api('post', `/cases/${record.id}/evidence`)
      .send({
        fieldKey: 'damage.observation',
        value: 'Direct observation',
        epistemicStatus: 'OBSERVED',
        sources: [{ sourceCode: source.body.sourceCode }],
      })
      .expect(400);
  });

  it('keeps observations conditional on survey notes and exports approved preliminary reviews', async () => {
    const { record, source } = await attachedCase(
      await cargoDocx([...sectorExamples.roadSurvey, randomUUID()]),
      'road-survey.docx',
    );
    await prisma.caseDocument.update({
      where: { id: source.id },
      data: { documentType: 'survey_notes' },
    });
    await api('post', `/cases/${record.id}/evidence`)
      .send({
        fieldKey: 'damage.observation',
        value: 'five wet cartons',
        epistemicStatus: 'OBSERVED',
        sources: [{ sourceCode: source.sourceCode }],
      })
      .expect(201);
    const report = await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    expect(report.body.content.evidenceLedger[0].text).toContain(
      'rilievo del perito',
    );
    const review = await api(
      'post',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/generate`,
    )
      .send({})
      .expect(201);
    await api(
      'post',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/revisions`,
    )
      .send({ content: review.body.content })
      .expect(201);
    const latest = await api(
      'get',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/latest`,
    ).expect(200);
    await api(
      'patch',
      `/cases/${record.id}/artifacts/${latest.body.id}/approve`,
    ).expect(200);
    await api(
      'get',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/latest/export`,
    ).expect(200);
    await api('post', `/cases/${record.id}/artifacts/STRUCTURED_CASE/revisions`)
      .send({ content: {} })
      .expect(400);
  });

  it('sends the current manually edited section to chat and rechecks stale artifacts after file extraction/deletion', async () => {
    const { record, source, document } = await attachedCase();
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/revisions`,
    )
      .send({
        content: {
          sections: [
            {
              id: 'shipment-and-cargo',
              paragraphs: ['Human edit kept for follow-up'],
              sourceCodes: [source.sourceCode],
            },
          ],
        },
      })
      .expect(201);
    fetchMock.mockResolvedValue(
      modelResponse({
        answer: 'La sezione corrente resta una bozza da verificare.',
        citations: [],
      }),
    );
    await api('post', '/chats')
      .send({
        caseId: record.id,
        message: 'Aggiorna questa sezione',
        targetSection: 'shipment-and-cargo',
      })
      .expect(201);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.contents[0].parts[0].text).toContain(
      'Human edit kept for follow-up',
    );
    await api('get', `/documents/${document.id}/content`).expect(200);
    expect(
      (
        await api(
          'get',
          `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/latest`,
        ).expect(200)
      ).body.isStale,
    ).toBe(true);
    await api('post', `/cases/${record.id}/artifacts/STRUCTURED_CASE/generate`)
      .send({})
      .expect(201);
    await api('delete', `/documents/${document.id}`).expect(200);
    const register = await api(
      'get',
      `/cases/${record.id}/document-register`,
    ).expect(200);
    expect(register.body[0].availability).toBe('REFERENCED_NOT_ACCESSIBLE');
    await api(
      'get',
      `/cases/${record.id}/artifacts/STRUCTURED_CASE/latest/export`,
    ).expect(409);
  });

  it.each(protectedRoutes)(
    'requires authentication for %s %s',
    async (method, url) => {
      await request(app.getHttpServer())[method](`/api${url}`).expect(401);
    },
  );

  it('keeps only wholly valid AI references and includes the latest manual section in enhanced drafts', async () => {
    const record = await newCase('Synthetic rail report review');
    const source = await api('post', `/cases/${record.id}/documents`)
      .send({
        availability: 'EXCERPT_ONLY',
        excerptText: sectorExamples.railShortage.join('\n'),
      })
      .expect(201);
    const finding = {
      title: 'Quantità da verificare',
      concern: 'La fonte riporta una differenza.',
      alternativeExplanation: 'Conteggio parziale.',
      suggestedCheck: 'Verificare il conteggio originale.',
      sourceCodes: [source.body.sourceCode],
      evidenceIds: [],
    };
    fetchMock.mockResolvedValue(
      modelResponse({
        findings: [
          finding,
          { ...finding, sourceCodes: [source.body.sourceCode, 'DOC-999'] },
        ],
      }),
    );
    const review = await api(
      'post',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/generate`,
    )
      .send({ enhanced: true })
      .expect(201);
    expect(review.body.content.aiSuggestions).toHaveLength(1);
    expect(review.body.content.aiSuggestions[0].status).toBe(
      'AI_SUGGESTION_REQUIRES_REVIEW',
    );
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/revisions`,
    )
      .send({
        content: {
          sections: [
            {
              id: 'shipment-and-cargo',
              paragraphs: ['Current manual rail section'],
              sourceCodes: [source.body.sourceCode],
            },
          ],
          aiSuggestions: [
            {
              id: 'shipment-and-cargo',
              paragraph: 'Previous suggestion for the target section',
              sourceCodes: [source.body.sourceCode],
            },
            {
              id: 'economic-assessment',
              paragraph: 'Untargeted suggestion retained for human review',
              sourceCodes: [source.body.sourceCode],
            },
          ],
        },
      })
      .expect(201);
    fetchMock.mockReset();
    const section = {
      id: 'shipment-and-cargo',
      heading: 'Merce',
      paragraph: 'Il documento riporta la quantità dichiarata.',
      sourceCodes: [source.body.sourceCode],
    };
    fetchMock.mockResolvedValue(
      modelResponse({
        sections: [
          section,
          { ...section, sourceCodes: [source.body.sourceCode, 'DOC-999'] },
          { ...section, id: 'economic-assessment' },
        ],
      }),
    );
    const draft = await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({ enhanced: true, targetSection: 'shipment-and-cargo' })
      .expect(201);
    expect(draft.body.content.aiSuggestions).toHaveLength(2);
    expect(draft.body.content.aiSuggestions[0].paragraph).toBe(
      'Untargeted suggestion retained for human review',
    );
    expect(draft.body.content.aiSuggestions[1].paragraph).toBe(
      'Il documento riporta la quantità dichiarata.',
    );
    expect(draft.body.content.sections[0].paragraphs).toEqual([
      'Current manual rail section',
    ]);
    const prompt = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
      .contents[0].parts[0].text as string;
    expect(prompt).toContain('Current manual rail section');
    expect(prompt).toContain('REGISTERED_EXCERPT');
  });

  it.each(['PRELIMINARY_REVIEW', 'SURVEY_REPORT_DRAFT'] as const)(
    'preserves current manual %s prose when adding suggestions and rebuilds stale prose',
    async (type) => {
      const record = await newCase('Synthetic narrative preservation');
      const generated = await api(
        'post',
        `/cases/${record.id}/artifacts/${type}/generate`,
      )
        .send({})
        .expect(201);
      const content =
        type === 'PRELIMINARY_REVIEW'
          ? {
              ...generated.body.content,
              limitations: ['MANUAL CURRENT NARRATIVE'],
            }
          : {
              ...generated.body.content,
              sections: [
                {
                  id: 'scope-and-limitations',
                  heading: 'Scope',
                  paragraphs: ['MANUAL CURRENT NARRATIVE'],
                  sourceCodes: [],
                },
              ],
            };
      await api('post', `/cases/${record.id}/artifacts/${type}/revisions`)
        .send({ content })
        .expect(201);
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          modelResponse(
            type === 'PRELIMINARY_REVIEW' ? { findings: [] } : { sections: [] },
          ),
        ),
      );
      const augmented = await api(
        'post',
        `/cases/${record.id}/artifacts/${type}/generate`,
      )
        .send({ enhanced: true })
        .expect(201);
      expect(JSON.stringify(augmented.body.content)).toContain(
        'MANUAL CURRENT NARRATIVE',
      );
      expect(augmented.body.status).toBe('DRAFT');
      const prompt = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
        .contents[0].parts[0].text as string;
      expect(prompt).toContain('MANUAL CURRENT NARRATIVE');
      await api('patch', `/cases/${record.id}`)
        .send({ openQuestions: ['Sources changed'] })
        .expect(200);
      const rebuilt = await api(
        'post',
        `/cases/${record.id}/artifacts/${type}/generate`,
      )
        .send({ enhanced: true })
        .expect(201);
      expect(JSON.stringify(rebuilt.body.content)).not.toContain(
        'MANUAL CURRENT NARRATIVE',
      );
    },
  );

  it.each(['PRELIMINARY_REVIEW', 'SURVEY_REPORT_DRAFT'] as const)(
    'rejects untargeted %s AI suggestions when the current narrative changes during generation',
    async (type) => {
      const record = await newCase();
      const base = await api(
        'post',
        `/cases/${record.id}/artifacts/${type}/generate`,
      )
        .send({})
        .expect(201);
      fetchMock.mockImplementationOnce(async () => {
        const content =
          type === 'PRELIMINARY_REVIEW'
            ? {
                ...base.body.content,
                limitations: ['Concurrent surveyor revision'],
              }
            : {
                ...base.body.content,
                sections: [
                  {
                    id: 'scope-and-limitations',
                    heading: 'Scope',
                    paragraphs: ['Concurrent surveyor revision'],
                    sourceCodes: [],
                  },
                ],
              };
        await api('post', `/cases/${record.id}/artifacts/${type}/revisions`)
          .send({ content })
          .expect(201);
        return modelResponse(
          type === 'PRELIMINARY_REVIEW' ? { findings: [] } : { sections: [] },
        );
      });
      await api('post', `/cases/${record.id}/artifacts/${type}/generate`)
        .send({ enhanced: true })
        .expect(409);
      expect(
        await prisma.caseArtifact.count({ where: { caseId: record.id, type } }),
      ).toBe(2);
    },
  );

  it('rejects a chat answer when its case changes during generation without saving an assistant message', async () => {
    const record = await newCase();
    fetchMock.mockImplementationOnce(async () => {
      await api('patch', `/cases/${record.id}`)
        .send({ openQuestions: ['New evidence requires review'] })
        .expect(200);
      return modelResponse({
        answer: 'Risposta basata sul contesto precedente.',
        citations: [],
      });
    });
    await api('post', '/chats')
      .send({ caseId: record.id, message: 'Verifica la pratica' })
      .expect(409);
    const chat = await prisma.chat.findFirstOrThrow({
      where: { caseId: record.id },
    });
    expect(
      await prisma.message.count({ where: { chatId: chat.id, role: 'USER' } }),
    ).toBe(1);
    expect(
      await prisma.message.count({
        where: { chatId: chat.id, role: 'ASSISTANT' },
      }),
    ).toBe(0);
  });

  it('does not persist a partial four-output generation when a configured template is unavailable', async () => {
    const record = await newCase();
    await prisma.case.update({
      where: { id: record.id },
      data: { reportTemplateId: 'unavailable-legacy-template' },
    });
    await api('post', `/cases/${record.id}/artifacts/generate`).expect(400);
    expect(
      await prisma.caseArtifact.count({ where: { caseId: record.id } }),
    ).toBe(0);
  });

  it('rolls back all four outputs if the final database write fails', async () => {
    const record = await newCase();
    // The constraint exists only in this disposable database and forces the fourth insert to fail.
    await prisma.$executeRaw`ALTER TABLE "case_artifacts" ADD CONSTRAINT "test_atomic_outputs" CHECK ("type" <> 'SURVEY_REPORT_DRAFT') NOT VALID`;
    try {
      const failed = await api(
        'post',
        `/cases/${record.id}/artifacts/generate`,
      ).expect(500);
      expect(failed.body.message).toBe('Internal server error');
      expect(
        await prisma.caseArtifact.count({ where: { caseId: record.id } }),
      ).toBe(0);
    } finally {
      await prisma.$executeRaw`ALTER TABLE "case_artifacts" DROP CONSTRAINT "test_atomic_outputs"`;
    }
  });

  it.each(['chat', 'draft'])(
    'rejects a stale %s suggestion when the manual target section changes during generation',
    async (kind) => {
      const record = await newCase();
      await api(
        'post',
        `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
      )
        .send({})
        .expect(201);
      fetchMock.mockImplementationOnce(async () => {
        await api(
          'post',
          `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/revisions`,
        )
          .send({
            content: {
              sections: [
                {
                  id: 'scope-and-limitations',
                  paragraphs: ['Concurrent manual edit'],
                  sourceCodes: [],
                },
              ],
            },
          })
          .expect(201);
        return modelResponse(
          kind === 'chat'
            ? { answer: 'Suggerimento precedente.', citations: [] }
            : { sections: [] },
        );
      });
      if (kind === 'chat')
        await api('post', '/chats')
          .send({
            caseId: record.id,
            message: 'Aggiorna questa sezione',
            targetSection: 'scope-and-limitations',
          })
          .expect(409);
      else
        await api(
          'post',
          `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
        )
          .send({ enhanced: true, targetSection: 'scope-and-limitations' })
          .expect(409);
      const latest = await api(
        'get',
        `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/latest`,
      ).expect(200);
      expect(latest.body.version).toBe(2);
      expect(latest.body.content.sections[0].paragraphs).toEqual([
        'Concurrent manual edit',
      ]);
    },
  );

  it.each([
    { sections: [] },
    {
      sections: [
        { id: 'scope-and-limitations' },
        { id: 'scope-and-limitations' },
      ],
    },
    { sections: [{ id: 'scope-and-limitations', paragraphs: [42] }] },
    { sections: [{ id: 'scope-and-limitations', sourceCodes: 'DOC-001' }] },
    {
      sections: [{ id: 'scope-and-limitations' }],
      aiSuggestions: 'not an array',
    },
  ])('rejects malformed manual report sections %j', async (content) => {
    const record = await newCase();
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/revisions`,
    )
      .send({ content })
      .expect(400);
    expect(
      await prisma.caseArtifact.count({ where: { caseId: record.id } }),
    ).toBe(1);
  });

  it('rejects an incomplete preliminary revision and omits obsolete report prose from chat context', async () => {
    const record = await newCase();
    await api(
      'post',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/generate`,
    )
      .send({})
      .expect(201);
    await api(
      'post',
      `/cases/${record.id}/artifacts/PRELIMINARY_REVIEW/revisions`,
    )
      .send({ content: { chronology: [] } })
      .expect(400);
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/revisions`,
    )
      .send({
        content: {
          sections: [
            {
              id: 'scope-and-limitations',
              paragraphs: ['OBSOLETE_REPORT_TEXT'],
              sourceCodes: [],
            },
          ],
        },
      })
      .expect(201);
    await api('patch', `/cases/${record.id}`)
      .send({ openQuestions: ['Changed case context'] })
      .expect(200);
    fetchMock.mockResolvedValue(
      modelResponse({
        answer: 'Serve una nuova bozza aggiornata.',
        citations: [],
      }),
    );
    await api('post', '/chats')
      .send({
        caseId: record.id,
        message: 'Aggiorna',
        targetSection: 'scope-and-limitations',
      })
      .expect(201);
    const prompt = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
      .contents[0].parts[0].text as string;
    expect(prompt).not.toContain('OBSOLETE_REPORT_TEXT');
    expect(prompt).toContain('"isStale":true');
  });

  it('registers, rejects duplicate accounts, logs in, rotates and detects replay, and logs out', async () => {
    const email = `registered-${randomUUID()}@example.test`;
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ email, password })
      .expect(201);
    expect(registered.body).toHaveProperty('id');
    expect(registered.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ email: email.toUpperCase(), password })
      .expect(409);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    expect(login.body.refreshToken).toBeUndefined();
    const cookie = login.headers['set-cookie'][0] as string;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    await api('get', '/auth/me', login.body.accessToken).expect(200);
    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);
    expect(refreshed.headers['set-cookie'][0]).not.toBe(cookie);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', refreshed.headers['set-cookie'][0])
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .expect(204);
    await api('post', '/auth/logout-all', login.body.accessToken).expect(204);
  });

  it.each([
    ['/auth/register', { email: 'bad', password }],
    ['/auth/register', { email: 'weak@example.test', password: 'short' }],
    ['/auth/login', { email: 'owner@example.test', password, ownerId: 1 }],
  ])('rejects invalid credentials/unknown fields at %s', async (url, body) => {
    await request(app.getHttpServer())
      .post(`/api${url}`)
      .set('Origin', origin)
      .send(body)
      .expect(400);
  });

  it('rejects untrusted auth origins, missing refresh cookies, wrong passwords and tampered JWTs', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'owner@example.test', password })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', origin)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'owner@example.test', password: 'wrong' })
      .expect(401);
    await api('get', '/auth/me', `${token.slice(0, -5)}xxxxx`).expect(401);
  });

  it('limits brute-force logins without trusting a forged forwarded address', async () => {
    for (let index = 0; index < 10; index += 1)
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', origin)
        .set('X-Forwarded-For', `203.0.113.${index}`)
        .send({ email: 'owner@example.test', password: 'wrong' })
        .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '203.0.113.200')
      .send({ email: 'owner@example.test', password })
      .expect(429);
  });

  it('scopes cases, validates DTOs and updates workflow metadata without accepting unsourced shipment facts', async () => {
    const record = await newCase();
    await api('get', `/cases/${record.id}`).expect(200);
    await api('get', `/cases/${record.id}`, otherToken).expect(404);
    const others = await api('get', '/cases', otherToken).expect(200);
    expect(
      others.body.some((item: { id: string }) => item.id === record.id),
    ).toBe(false);
    await api('post', '/cases')
      .send({ title: 'Bad case', shipment: { origin: 'invented' } })
      .expect(400);
    await api('post', '/cases').send({ title: '  ' }).expect(400);
    await api('patch', `/cases/${record.id}`).send({ title: null }).expect(400);
    await api('patch', `/cases/${record.id}`)
      .send({ status: 'APPROVED' })
      .expect(400);
    const updated = await api('patch', `/cases/${record.id}`)
      .send({
        title: 'Reviewed case',
        assignment: { requestedScope: ['Cargo condition'] },
        openQuestions: ['Obtain reefer log'],
      })
      .expect(200);
    expect(updated.body.revision).toBeGreaterThan(record.revision);
    expect(updated.body.assignment.sourceStatus).toBe(
      'USER_ENTERED_SCOPE_NOT_CASE_EVIDENCE',
    );
    await api('get', '/cases/not-a-uuid').expect(400);
  });

  it('registers unavailable originals and excerpts, preserves source links and checks issue ownership', async () => {
    const record = await newCase();
    await api('post', `/cases/${record.id}/documents`)
      .send({ availability: 'EXCERPT_ONLY' })
      .expect(400);
    const source = await api('post', `/cases/${record.id}/documents`)
      .send({
        availability: 'EXCERPT_ONLY',
        displayName: 'Court order excerpt',
        excerptText: 'Two containers contain 1080 and 894 cartons.',
      })
      .expect(201);
    await api('post', `/cases/${record.id}/documents`)
      .send({
        availability: 'REFERENCED_NOT_ACCESSIBLE',
        displayName: 'Original survey report',
      })
      .expect(201);
    const register = await api(
      'get',
      `/cases/${record.id}/document-register`,
    ).expect(200);
    expect(register.body).toHaveLength(2);
    await api('post', `/cases/${record.id}/evidence`)
      .send({
        fieldKey: 'shipment.cartons',
        value: 1080,
        epistemicStatus: 'STATED_IN_DOCUMENT',
      })
      .expect(400);
    const evidence = await api('post', `/cases/${record.id}/evidence`)
      .send({
        fieldKey: 'shipment.cartons',
        value: 1080,
        unit: 'cartons',
        epistemicStatus: 'STATED_IN_DOCUMENT',
        sources: [
          {
            sourceCode: source.body.sourceCode,
            excerpt: 'Two containers contain 1080 and 894 cartons.',
          },
        ],
      })
      .expect(201);
    await api('post', `/cases/${record.id}/evidence`)
      .send({
        fieldKey: 'claim.amount',
        value: 31500,
        epistemicStatus: 'CALCULATED',
        sources: [{ sourceCode: source.body.sourceCode }],
      })
      .expect(400);
    await api('post', `/cases/${record.id}/events`)
      .send({
        event: 'The source reports delivery',
        epistemicStatus: 'STATED_IN_DOCUMENT',
        dateType: 'EVENT',
        date: '2026-09-08',
        sources: [{ sourceCode: source.body.sourceCode }],
      })
      .expect(201);
    await api('post', `/cases/${record.id}/events`)
      .send({
        event: 'Impossible date',
        epistemicStatus: 'UNKNOWN',
        date: '2026-02-30',
      })
      .expect(400);
    const issue = await api('post', `/cases/${record.id}/issues`)
      .send({
        title: 'Check tally scope',
        explanation: 'The tally may cover only one delivery lot.',
        status: 'NOT_VERIFIABLE',
        evidenceIds: [evidence.body.id],
      })
      .expect(201);
    await api('patch', `/cases/${record.id}/issues/${issue.body.id}`)
      .send({ status: 'NOT_APPLICABLE' })
      .expect(200);
    const another = await newCase();
    await api('post', `/cases/${another.id}/issues`)
      .send({
        title: 'Wrong evidence',
        explanation: 'Wrong case reference',
        status: 'ISSUE_FOUND',
        evidenceIds: [evidence.body.id],
      })
      .expect(400);
    await api('patch', `/cases/${another.id}/issues/${issue.body.id}`)
      .send({ status: 'COMPLIANT' })
      .expect(404);
  });

  it('uploads, downloads, extracts and soft-deletes documents while enforcing ownership and integrity', async () => {
    const bytes = await cargoDocx([...sectorExamples.seaWaybill, randomUUID()]);
    const document = await upload(bytes, 'sea-waybill-test.docx');
    await api('get', `/documents/${document.id}/download`)
      .expect(200)
      .expect('Content-Type', /wordprocessingml/);
    await api('get', `/documents/${document.id}/download`, otherToken).expect(
      404,
    );
    const content = await api(
      'get',
      `/documents/${document.id}/content`,
    ).expect(200);
    expect(content.body.content).toContain('1080 cartons on 29 pallets');
    await api('post', `/documents/${document.id}/extraction-review`).expect(
      200,
    );
    const found = await api('get', `/documents?id=${document.id}`).expect(200);
    expect(found.body.map((item: { id: string }) => item.id)).toEqual([
      document.id,
    ]);
    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    await fs.appendFile(stored.path, 'tampered');
    await api('get', `/documents/${document.id}/download`).expect(409);
    await api('delete', `/documents/${document.id}`).expect(200);
    await api('get', `/documents/${document.id}/download`).expect(404);
    await api('delete', `/documents/${document.id}`).expect(404);
    expect(found.body[0]).not.toHaveProperty('path');
  });

  it('rejects missing, renamed, oversized files and unexpected multipart fields', async () => {
    await api('post', '/documents/upload').expect(400);
    await api('post', '/documents/upload')
      .attach('file', Buffer.from('<html>fake</html>'), 'fake.pdf')
      .expect(400);
    await api('post', '/documents/upload')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'huge.csv')
      .expect(413);
    await api('post', '/documents/upload')
      .field('ownerId', String(otherId))
      .attach('file', Buffer.from('a,b\n1,2'), 'fake-owner.csv')
      .expect(400);
  });

  it('prevents racing duplicate uploads and permits independent owners', async () => {
    const bytes = Buffer.from(`value\n1\n#${randomUUID()}`);
    const results = await Promise.all([
      api('post', '/documents/upload').attach('file', bytes, 'same.csv'),
      api('post', '/documents/upload').attach('file', bytes, 'same.csv'),
    ]);
    expect(
      results
        .map((result) => result.status)
        .sort((left, right) => left - right),
    ).toEqual([201, 409]);
    await api('post', '/documents/upload', otherToken)
      .attach('file', bytes, 'same.csv')
      .expect(201);
    const hash = createHash('sha256').update(bytes).digest('hex');
    expect(
      await prisma.document.count({
        where: { hash, ownerId: userId, deleted_at: null },
      }),
    ).toBe(1);
  });

  it.each(Object.entries(sectorExamples))(
    'extracts the synthetic sector document %s without losing source wording',
    async (_name, lines) => {
      const document = await upload(
        await cargoDocx([...lines, randomUUID()]),
        `${_name}.docx`,
      );
      const extracted = await api(
        'get',
        `/documents/${document.id}/content`,
      ).expect(200);
      for (const line of lines) expect(extracted.body.content).toContain(line);
      expect(extracted.body.extractionStatus).toBe('EXTRACTED');
    },
  );

  it('extracts nested MIME claim email, metadata, and quoted statements without reading attachments as facts', async () => {
    const document = await upload(
      Buffer.from(claimEmail),
      'cargo-claim-test.eml',
    );
    const extracted = await api(
      'get',
      `/documents/${document.id}/content`,
    ).expect(200);
    expect(extracted.body.content).toContain(
      'The consignee reports that 12 cartons arrived crushed.',
    );
    expect(extracted.body.content).not.toContain('test attachment');
    expect(extracted.body.sourceMetadata).toMatchObject({
      sender: 'consignee@example.test',
      messageId: '<cargo-claim-test-1@example.test>',
      attachmentNames: ['packing-list-test.pdf'],
    });
  });

  it('extracts a real PDF air cargo claim and keeps page-specific citations', async () => {
    const { record, document, source } = await attachedCase(
      cargoPdf(sectorExamples.airClaim),
      'air-cargo-claim.pdf',
    );
    const extracted = await api(
      'get',
      `/documents/${document.id}/content`,
    ).expect(200);
    for (const line of sectorExamples.airClaim)
      expect(extracted.body.content).toContain(line);
    expect(extracted.body.pages).toHaveLength(1);
    expect(extracted.body.pages[0].pageNumber).toBe(1);
    const fact = {
      fieldKey: 'claim.amount',
      valueText: 'EUR 12500',
      numericValue: 12500,
      unit: 'EUR',
      epistemicStatus: 'REPORTED',
      attribution: 'The consignee',
      pageNumber: 2,
      excerpt: sectorExamples.airClaim[2],
    };
    fetchMock.mockResolvedValue(
      modelResponse({
        documentType: 'claim',
        imageDescription: null,
        facts: [fact],
        events: [],
        openQuestions: [],
      }),
    );
    const wrongPage = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    expect(wrongPage.body.suggestions).toHaveLength(0);
    fetchMock.mockReset().mockResolvedValue(
      modelResponse({
        documentType: 'claim',
        imageDescription: null,
        facts: [{ ...fact, pageNumber: 1 }],
        events: [],
        openQuestions: [],
      }),
    );
    const correctPage = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    expect(correctPage.body.suggestions).toHaveLength(1);
    await api(
      'post',
      `/cases/${record.id}/extractions/${correctPage.body.id}/accept`,
    )
      .send({ suggestionIds: [correctPage.body.suggestions[0].id] })
      .expect(200);
    const evidence = await prisma.caseEvidence.findFirstOrThrow({
      where: { caseId: record.id },
      include: { sourceLinks: true },
    });
    expect(evidence.epistemicStatus).toBe('REPORTED');
    expect(evidence.sourceLinks[0].pageNumber).toBe(1);
  });

  it.each(['jpeg', 'tiff'] as const)(
    'stores and downloads valid %s cargo image originals',
    async (format) => {
      const buffer = await sharp({
        create: {
          width: 100,
          height: 80,
          channels: 3,
          background: { r: 100, g: 140, b: 180 },
        },
      })
        .toFormat(format)
        .toBuffer();
      const document = await upload(buffer, `cargo-test.${format}`);
      const downloaded = await api('get', `/documents/${document.id}/download`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(downloaded.body).toEqual(buffer);
    },
  );

  it('rejects image pixel bombs and malicious download header filenames', async () => {
    const oversized = await sharp({
      create: { width: 6400, height: 6400, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await api('post', '/documents/upload')
      .attach('file', oversized, 'oversized.png')
      .expect(400);
    const doc = await upload(
      Buffer.from(`a,b\n2,3\n#${randomUUID()}`),
      'safe.csv',
    );
    await prisma.document.update({
      where: { id: doc.id },
      data: { fileName: `..\\evil\r\nX-Injected: true\u202etest.csv` },
    });
    const downloaded = await api('get', `/documents/${doc.id}/download`).expect(
      200,
    );
    expect(downloaded.headers['x-injected']).toBeUndefined();
    expect(downloaded.headers['content-disposition']).not.toMatch(
      /[\r\n\u202e]/,
    );
  });

  it('preserves email attribution and deduplicates repeated statements before human acceptance', async () => {
    const { record, source } = await attachedCase(
      Buffer.from(claimEmail.replace('cargo-claim-test-1', randomUUID())),
      'reported-cargo-damage.eml',
    );
    const fact = {
      fieldKey: 'damage.carton_count',
      valueText: '12 crushed cartons',
      numericValue: 12,
      unit: 'cartons',
      epistemicStatus: 'STATED_IN_DOCUMENT',
      attribution: null,
      pageNumber: null,
      excerpt: 'The consignee reports that 12 cartons arrived crushed.',
    };
    fetchMock.mockResolvedValue(
      modelResponse({
        documentType: 'email',
        imageDescription: null,
        facts: [
          fact,
          {
            ...fact,
            excerpt:
              'Earlier email: the consignee reports that 12 cartons arrived crushed.',
          },
        ],
        events: [],
        openQuestions: [],
      }),
    );
    const proposal = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    expect(proposal.body.suggestions).toHaveLength(1);
    expect(proposal.body.suggestions[0].content).toMatchObject({
      epistemicStatus: 'REPORTED',
      attribution: 'consignee@example.test',
    });
    await api(
      'post',
      `/cases/${record.id}/extractions/${proposal.body.id}/accept`,
    )
      .send({ suggestionIds: [proposal.body.suggestions[0].id] })
      .expect(200);
    const report = await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    expect(JSON.stringify(report.body.content)).toContain(
      'consignee@example.test riferisce',
    );
  });

  it('refuses stale AI work after a concurrent case change and allows only one acceptance', async () => {
    const { record, source } = await attachedCase(
      Buffer.from(
        'description,quantity\nWarehouse received 24 wrapped pallets.,24\n',
      ),
    );
    const response = {
      documentType: 'warehouse_tally',
      imageDescription: null,
      facts: [
        {
          fieldKey: 'shipment.pallet_count',
          valueText: '24 pallets',
          numericValue: 24,
          unit: 'pallets',
          epistemicStatus: 'STATED_IN_DOCUMENT',
          attribution: null,
          pageNumber: null,
          excerpt: 'Warehouse received 24 wrapped pallets.',
        },
      ],
      events: [],
      openQuestions: [],
    };
    fetchMock.mockImplementationOnce(async () => {
      await api('patch', `/cases/${record.id}`)
        .send({ title: 'Updated while AI was running' })
        .expect(200);
      return modelResponse(response);
    });
    await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(409);
    expect(
      await prisma.caseExtractionProposal.count({
        where: { caseId: record.id },
      }),
    ).toBe(0);
    fetchMock.mockResolvedValue(modelResponse(response));
    const proposal = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    const result = await Promise.all(
      [0, 1].map(() =>
        api(
          'post',
          `/cases/${record.id}/extractions/${proposal.body.id}/accept`,
        ).send({ suggestionIds: [proposal.body.suggestions[0].id] }),
      ),
    );
    expect(
      result.map((item) => item.status).sort((left, right) => left - right),
    ).toEqual([200, 409]);
    expect(
      await prisma.caseEvidence.count({ where: { caseId: record.id } }),
    ).toBe(1);
  });

  it('rejects deep JSON, oversized requests and unsupported template versions', async () => {
    let nested: unknown = 'leaf';
    for (let depth = 0; depth < 40; depth += 1) nested = { child: nested };
    await api('post', '/cases')
      .send({ title: 'Deep structure', extra: nested })
      .expect(400);
    await api('post', '/cases')
      .send({ title: 'x'.repeat(200_000) })
      .expect(413);
    const invalidJson = await api('post', '/cases')
      .set('Content-Type', 'application/json')
      .send('{"title":')
      .expect(400);
    // Nest's Express adapter maps JSON SyntaxError to its standard BadRequestException.
    expect(invalidJson.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
    const record = await newCase();
    await api('patch', `/cases/${record.id}`)
      .send({ reportTemplateId: 'unimplemented-template' })
      .expect(400);
    await api('patch', `/cases/${record.id}`)
      .send({ clicheSetVersion: '99.0' })
      .expect(400);
    for (const url of [
      '/cases',
      '/chats',
      '/documents',
      `/cases/${record.id}/extractions`,
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/versions`,
    ]) {
      await api('get', `${url}?limit=101`).expect(400);
      await api('get', `${url}?offset=-1`).expect(400);
    }
  });

  it.each([
    ['SUM', -50],
    ['MIN', -18],
    ['MAX', -4.5],
    ['MEAN', -12.5],
    ['COUNT', 4],
    ['RANGE', 13.5],
  ])(
    'calculates %s on reefer measurements, excluding formulas and sensor errors',
    async (operation, expected) => {
      const { record, source } = await attachedCase(
        await temperatureWorkbook(),
        `reefer-${randomUUID()}.xlsx`,
      );
      const calculation = await api(
        'post',
        `/cases/${record.id}/documents/${source.sourceCode}/calculations`,
      )
        .send({
          fieldKey: 'temperature.summary',
          columnHeader: 'Temperature C',
          operation,
          unit: 'C',
        })
        .expect(201);
      expect(calculation.body.calculation.result).toBe(expected);
      expect(calculation.body.calculation.formulaCellsExcluded).toBe(1);
      expect(calculation.body.calculation.nonNumericCellCount).toBe(1);
      expect(calculation.body.evidence.epistemicStatus).toBe('CALCULATED');
      expect(
        calculation.body.evidence.calculationMetadata.sourceSha256,
      ).toMatch(/^[a-f0-9]{64}$/);
    },
  );

  it('calculates comma-decimal CSV and rejects ambiguous columns, separators and missing units', async () => {
    const { record, source } = await attachedCase();
    const base = {
      fieldKey: 'temperature.mean',
      columnHeader: 'temperature C',
      operation: 'MEAN',
      unit: 'C',
      decimalSeparator: ',',
    };
    const response = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/calculations`,
    )
      .send(base)
      .expect(201);
    expect(response.body.calculation.result).toBeCloseTo(-35 / 3);
    await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/calculations`,
    )
      .send({ ...base, columnHeader: 'missing' })
      .expect(400);
    await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/calculations`,
    )
      .send({ ...base, thousandsSeparator: ',' })
      .expect(400);
    await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/calculations`,
    )
      .send({ ...base, unit: '' })
      .expect(400);
  });

  it('creates AI proposals, accepts sourced facts/events exactly once and rejects pending proposals', async () => {
    const { record, source } = await attachedCase(
      Buffer.from(
        'description,quantity\nThe warehouse received 24 wrapped pallets.,24\n',
      ),
    );
    fetchMock.mockImplementation(async () =>
      modelResponse({
        documentType: 'warehouse_tally',
        imageDescription: null,
        facts: [
          {
            fieldKey: 'shipment.pallet_count',
            valueText: '24 pallets',
            numericValue: 24,
            unit: 'pallets',
            epistemicStatus: 'STATED_IN_DOCUMENT',
            attribution: null,
            pageNumber: null,
            excerpt: 'The warehouse received 24 wrapped pallets.',
          },
        ],
        events: [
          {
            event: 'Warehouse receipt',
            date: null,
            dateType: 'UNKNOWN',
            epistemicStatus: 'STATED_IN_DOCUMENT',
            attribution: null,
            pageNumber: null,
            excerpt: 'The warehouse received 24 wrapped pallets.',
          },
        ],
        openQuestions: ['Does this tally cover all delivery lots?'],
      }),
    );
    const proposal = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    expect(proposal.body.suggestions).toHaveLength(2);
    expect(
      await prisma.caseEvidence.count({ where: { caseId: record.id } }),
    ).toBe(0);
    await api('get', `/cases/${record.id}/extractions`).expect(200);
    const suggestionIds = proposal.body.suggestions.map(
      (item: { id: string }) => item.id,
    );
    await api(
      'post',
      `/cases/${record.id}/extractions/${proposal.body.id}/accept`,
    )
      .send({ suggestionIds })
      .expect(200);
    await api(
      'post',
      `/cases/${record.id}/extractions/${proposal.body.id}/accept`,
    )
      .send({ suggestionIds })
      .expect(409);
    expect(
      await prisma.caseEvidence.count({ where: { caseId: record.id } }),
    ).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId: record.id } })).toBe(
      1,
    );
    const second = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    await api(
      'post',
      `/cases/${record.id}/extractions/${second.body.id}/reject`,
    ).expect(200);
    await api(
      'post',
      `/cases/${record.id}/extractions/${second.body.id}/accept`,
    )
      .send({ suggestionIds: [second.body.suggestions[0].id] })
      .expect(409);
    await api(
      'post',
      `/cases/${record.id}/extractions/${second.body.id}/reject`,
    ).expect(409);
  });

  it('uses image captions as review proposals without inventing observations or requiring photo text', async () => {
    const picture = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 200, g: 120, b: 60 },
      },
    })
      .png()
      .toBuffer();
    const { record, source } = await attachedCase(
      picture,
      'synthetic-cargo-photo.png',
    );
    fetchMock.mockResolvedValue(
      modelResponse({
        documentType: 'photograph',
        imageDescription:
          'A uniform orange area is visible; no cargo details can be established.',
        facts: [],
        events: [],
        openQuestions: [],
      }),
    );
    const proposal = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    const before = await prisma.case.findUniqueOrThrow({
      where: { id: record.id },
    });
    await api(
      'post',
      `/cases/${record.id}/extractions/${proposal.body.id}/accept`,
    )
      .send({ suggestionIds: [proposal.body.suggestions[0].id] })
      .expect(200);
    const after = await prisma.case.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(after.revision).toBe(before.revision);
    expect(
      await prisma.caseEvidence.count({ where: { caseId: record.id } }),
    ).toBe(0);
  });

  it('creates all four artifacts, versions manual edits, requires narrative approval and blocks stale exports', async () => {
    const record = await newCase();
    const source = await api('post', `/cases/${record.id}/documents`)
      .send({
        availability: 'EXCERPT_ONLY',
        excerptText: 'The waybill records frozen beef on two containers.',
      })
      .expect(201);
    await api('post', `/cases/${record.id}/evidence`)
      .send({
        fieldKey: 'shipment.cargo_description',
        value: 'frozen beef',
        epistemicStatus: 'STATED_IN_DOCUMENT',
        sources: [{ sourceCode: source.body.sourceCode }],
      })
      .expect(201);
    const generated = await api(
      'post',
      `/cases/${record.id}/artifacts/generate`,
    ).expect(201);
    expect(generated.body).toHaveLength(4);
    await api('get', `/cases/${record.id}/artifacts`).expect(200);
    await api(
      'get',
      `/cases/${record.id}/artifacts/STRUCTURED_CASE/latest`,
    ).expect(200);
    await api(
      'get',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/latest/export`,
    ).expect(409);
    const revision = await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/revisions`,
    )
      .send({
        content: {
          sections: [
            {
              id: 'shipment-and-cargo',
              heading: 'Merce',
              paragraph: 'Il documento DOC-001 riporta carne congelata.',
              sourceCodes: [source.body.sourceCode],
            },
          ],
        },
      })
      .expect(201);
    expect(revision.body.version).toBe(2);
    const versions = await api(
      'get',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/versions`,
    ).expect(200);
    expect(
      versions.body.map((item: { version: number }) => item.version),
    ).toEqual([2, 1]);
    const older = generated.body.find(
      (item: { type: string }) => item.type === 'SURVEY_REPORT_DRAFT',
    );
    await api(
      'patch',
      `/cases/${record.id}/artifacts/${older.id}/approve`,
    ).expect(409);
    await api(
      'patch',
      `/cases/${record.id}/artifacts/${revision.body.id}/approve`,
    ).expect(200);
    await api(
      'patch',
      `/cases/${record.id}/artifacts/${revision.body.id}/approve`,
    ).expect(409);
    const exported = await api(
      'get',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/latest/export`,
    )
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const text = await mammoth.extractRawText({
      buffer: exported.body as Buffer,
    });
    expect(text.value).toContain(
      'Il documento DOC-001 riporta carne congelata.',
    );
    const structured = await api(
      'get',
      `/cases/${record.id}/artifacts/STRUCTURED_CASE/latest/export`,
    ).expect(200);
    expect(
      structured.body.shipment.cargo_description[0].source_refs[0].source_code,
    ).toBe(source.body.sourceCode);
    const register = await api(
      'get',
      `/cases/${record.id}/artifacts/DOCUMENT_REGISTER/latest/export`,
    )
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(register.body);
    expect(
      workbook.getWorksheet('Document register')?.getCell('A2').value,
    ).toBe(source.body.sourceCode);
    await api('patch', `/cases/${record.id}`)
      .send({ openQuestions: ['New technical information needed'] })
      .expect(200);
    await api(
      'get',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/latest/export`,
    ).expect(409);
    expect(
      (await api('get', `/cases/${record.id}`).expect(200)).body.status,
    ).toBe('DRAFT');
  });

  it('allocates concurrent artifact versions without duplicates and invalidates approval when a new report is generated', async () => {
    const record = await newCase();
    const results = await Promise.all([
      api(
        'post',
        `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
      ).send({}),
      api(
        'post',
        `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
      ).send({}),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(
      results
        .map((result) => result.body.version)
        .sort((left, right) => left - right),
    ).toEqual([1, 2]);
    const latest = results.find((result) => result.body.version === 2)!;
    await api(
      'patch',
      `/cases/${record.id}/artifacts/${latest.body.id}/approve`,
    ).expect(200);
    await api(
      'post',
      `/cases/${record.id}/artifacts/SURVEY_REPORT_DRAFT/generate`,
    )
      .send({})
      .expect(201);
    expect(
      (await api('get', `/cases/${record.id}`).expect(200)).body.status,
    ).toBe('DRAFT');
  });

  it('returns a diagnosable readiness error when a deployed schema is missing an event column', async () => {
    const record = await newCase('Outdated schema regression');
    await prisma.$executeRaw`ALTER TABLE case_events RENAME COLUMN attribution TO qa_missing_attribution`;
    try {
      const response = await api('get', `/cases/${record.id}`).expect(503);
      expect(response.body).toEqual({
        code: 'DATABASE_SCHEMA_OUTDATED',
        message:
          'Database migrations must be applied before using the application',
        statusCode: 503,
      });
    } finally {
      await prisma.$executeRaw`ALTER TABLE case_events RENAME COLUMN qa_missing_attribution TO attribution`;
    }
    await api('get', `/cases/${record.id}`).expect(200);
  });

  it('fails the startup migration preflight when the last deployment migration is pending', async () => {
    await prisma.$executeRaw`UPDATE "_prisma_migrations" SET migration_name = 'qa_pending_event_attribution' WHERE migration_name = '20261010201000_event_attribution'`;
    try {
      await expect(
        promisify(execFile)(
          process.execPath,
          ['node_modules/prisma/build/index.js', 'migrate', 'status'],
          { env: process.env, timeout: 20_000 },
        ),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      await prisma.$executeRaw`UPDATE "_prisma_migrations" SET migration_name = '20261010201000_event_attribution' WHERE migration_name = 'qa_pending_event_attribution'`;
    }
    await promisify(execFile)(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'status'],
      { env: process.env, timeout: 20_000 },
    );
  }, 60_000);

  it.each(['/chats', '/chats/new'])(
    'creates scoped chat via %s and preserves messages/citations',
    async (route) => {
      const record = await newCase();
      const source = await api('post', `/cases/${record.id}/documents`)
        .send({
          availability: 'EXCERPT_ONLY',
          excerptText: 'The survey report records damaged cartons.',
        })
        .expect(201);
      fetchMock.mockImplementation(async () =>
        modelResponse({
          answer:
            'Il report riporta cartoni danneggiati; la causa resta da verificare.',
          citations: [
            {
              sourceId: source.body.id,
              pageNumber: null,
              excerpt: 'The survey report records damaged cartons.',
            },
          ],
        }),
      );
      const chat = await api('post', route)
        .send({ caseId: record.id, message: 'Che cosa riporta il documento?' })
        .expect(201);
      expect(chat.body.assistantMessage.sources[0].caseDocumentId).toBe(
        source.body.id,
      );
      await api('get', `/chats/${chat.body.chatId}`).expect(200);
      await api('get', `/chats/${chat.body.chatId}/documents`).expect(200);
      await api('get', `/chats/${chat.body.chatId}`, otherToken).expect(404);
      await api('post', `/chats/${chat.body.chatId}/messages`)
        .send({ message: 'Quali verifiche servono?' })
        .expect(201);
      await api('get', `/chats?caseId=${record.id}`).expect(200);
      await api('delete', `/chats/${chat.body.chatId}`).expect(204);
      await api('get', `/chats/${chat.body.chatId}`).expect(404);
    },
  );

  it('rejects hallucinated citations, provider overload and missing cases without cross-case data access', async () => {
    const record = await newCase();
    fetchMock.mockResolvedValueOnce(
      modelResponse({
        answer: 'A fabricated claim',
        citations: [
          {
            sourceId: randomUUID(),
            pageNumber: null,
            excerpt: 'fabricated source excerpt',
          },
        ],
      }),
    );
    await api('post', '/chats')
      .send({ caseId: record.id, message: 'Test unsupported answer' })
      .expect(503);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    const unavailable = await api('post', '/chats')
      .send({ caseId: record.id, message: 'Test overload' })
      .expect(503);
    expect(unavailable.body.chatId).toEqual(expect.any(String));
    const recovered = await api(
      'get',
      `/chats/${unavailable.body.chatId}`,
    ).expect(200);
    expect(recovered.body.messages).toHaveLength(1);
    expect(recovered.body.messages[0]).toMatchObject({
      role: 'USER',
      content: 'Test overload',
    });
    await api('get', `/chats/${unavailable.body.chatId}`, otherToken).expect(
      404,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await api('post', '/chats', otherToken)
      .send({ caseId: record.id, message: 'Test access control' })
      .expect(404);
    await api('get', `/cases/${record.id}/artifacts`, otherToken).expect(404);
    await api(
      'post',
      `/cases/${record.id}/artifacts/STRUCTURED_CASE/generate`,
      otherToken,
    )
      .send({})
      .expect(404);
    await api('get', `/cases/${record.id}/extractions`, otherToken).expect(404);
  });

  it('rejects another owner on every resource route without revealing the resource', async () => {
    const { record, document, source } = await attachedCase();
    const issue = await api('post', `/cases/${record.id}/issues`)
      .send({
        status: 'NOT_VERIFIABLE',
        title: 'Check custody',
        explanation: 'No signed receipt is available.',
      })
      .expect(201);
    const artifacts = await api(
      'post',
      `/cases/${record.id}/artifacts/generate`,
    ).expect(201);
    const report = artifacts.body.find(
      (artifact: { type: string }) => artifact.type === 'SURVEY_REPORT_DRAFT',
    );
    fetchMock.mockResolvedValueOnce(
      modelResponse({
        documentType: 'temperature_record',
        imageDescription: null,
        facts: [],
        events: [],
        openQuestions: [],
      }),
    );
    const proposal = await api(
      'post',
      `/cases/${record.id}/documents/${source.sourceCode}/extract`,
    ).expect(201);
    fetchMock.mockResolvedValueOnce(
      modelResponse({ answer: 'Synthetic case assistance.', citations: [] }),
    );
    const chat = await api('post', '/chats')
      .send({ caseId: record.id, message: 'Review the cargo file.' })
      .expect(201);
    for (const [method, route] of protectedRoutes.filter(
      ([, url]) =>
        url.startsWith(`/cases/${caseId}`) ||
        url.startsWith(`/documents/${resourceId}`) ||
        url.startsWith(`/chats/${resourceId}`),
    )) {
      const id = route.startsWith('/documents')
        ? document.id
        : route.startsWith('/chats')
          ? chat.body.chatId
          : route.includes('/issues/')
            ? issue.body.id
            : route.includes('/extractions/')
              ? proposal.body.id
              : report.id;
      const url = route
        .replaceAll(caseId, record.id)
        .replaceAll(resourceId, id)
        .replace('DOC-001', source.sourceCode);
      let body: Record<string, unknown> = {};
      if (url.endsWith('/documents')) body = { documentId: document.id };
      else if (url.endsWith('/events'))
        body = { event: 'Unknown event', epistemicStatus: 'UNKNOWN' };
      else if (url.endsWith('/evidence'))
        body = {
          fieldKey: 'damage.cause',
          value: 'unknown',
          epistemicStatus: 'UNKNOWN',
        };
      else if (url.endsWith('/issues'))
        body = {
          title: 'Issue',
          explanation: 'Unverified',
          status: 'NOT_VERIFIABLE',
        };
      else if (url.endsWith('/calculations'))
        body = {
          fieldKey: 'temperature.mean',
          columnHeader: 'temperature C',
          operation: 'MEAN',
          unit: 'C',
        };
      else if (url.endsWith('/accept'))
        body = { suggestionIds: [randomUUID()] };
      else if (url.endsWith('/revisions')) body = { content: { sections: [] } };
      else if (url.endsWith('/messages'))
        body = { message: 'Unauthorized request' };
      const attempt = api(method, url, otherToken);
      await (
        method === 'post' || method === 'patch' ? attempt.send(body) : attempt
      ).expect(404);
    }
    expect(
      (await api('get', '/cases?limit=100', otherToken).expect(200)).body.some(
        (item: { id: string }) => item.id === record.id,
      ),
    ).toBe(false);
    expect(
      (await api('get', `/chats?caseId=${record.id}`, otherToken).expect(200))
        .body,
    ).toEqual([]);
    expect(
      (await api('get', `/documents?id=${document.id}`, otherToken).expect(200))
        .body,
    ).toEqual([]);
  });

  it('paginates message history and validates selected sources before persisting a request', async () => {
    const record = await newCase();
    const countBefore = await prisma.chat.count({
      where: { caseId: record.id },
    });
    await api('post', '/chats')
      .send({
        caseId: record.id,
        message: 'Invalid selection',
        documentIds: [randomUUID()],
      })
      .expect(400);
    expect(await prisma.chat.count({ where: { caseId: record.id } })).toBe(
      countBefore,
    );
    fetchMock.mockResolvedValue(
      modelResponse({ answer: 'Working draft response.', citations: [] }),
    );
    const chat = await api('post', '/chats')
      .send({ caseId: record.id, message: 'Start review' })
      .expect(201);
    const messageCount = await prisma.message.count({
      where: { chatId: chat.body.chatId },
    });
    await api('post', `/chats/${chat.body.chatId}/messages`)
      .send({ message: 'Invalid selection', documentIds: [randomUUID()] })
      .expect(400);
    expect(
      await prisma.message.count({ where: { chatId: chat.body.chatId } }),
    ).toBe(messageCount);
    await prisma.message.createMany({
      data: Array.from({ length: 60 }, (_, index) => ({
        chatId: chat.body.chatId,
        role: 'USER',
        content: `Synthetic later message ${index}`,
        created_at: new Date(Date.now() + index + 1000),
      })),
    });
    const first = await api('get', `/chats/${chat.body.chatId}`).expect(200);
    const second = await api(
      'get',
      `/chats/${chat.body.chatId}?offset=50`,
    ).expect(200);
    expect(first.body._count.messages).toBe(62);
    expect(second.body._count.messages).toBe(62);
    expect(first.body.messages).toHaveLength(50);
    expect(second.body.messages).toHaveLength(12);
    expect(
      new Set(
        [...first.body.messages, ...second.body.messages].map(
          (message: { id: string }) => message.id,
        ),
      ).size,
    ).toBe(62);
    await api('get', `/chats/${chat.body.chatId}?limit=101`).expect(400);
  });

  it.each(['PRELIMINARY_REVIEW', 'SURVEY_REPORT_DRAFT'])(
    'rejects outdated and racing manual edits of %s using the opened artifact ID',
    async (type) => {
      const record = await newCase();
      const artifact = (
        await api('post', `/cases/${record.id}/artifacts/${type}/generate`)
          .send({})
          .expect(201)
      ).body as { id: string; content: Record<string, unknown> };
      const payload = {
        content: artifact.content,
        expectedArtifactId: artifact.id,
      };
      const raced = await Promise.all([
        api('post', `/cases/${record.id}/artifacts/${type}/revisions`).send(
          payload,
        ),
        api('post', `/cases/${record.id}/artifacts/${type}/revisions`).send(
          payload,
        ),
      ]);
      expect(
        raced
          .map((response) => response.status)
          .sort((left, right) => left - right),
      ).toEqual([201, 409]);
      await api('post', `/cases/${record.id}/artifacts/${type}/revisions`)
        .send(payload)
        .expect(409);
      expect(
        await prisma.caseArtifact.count({ where: { caseId: record.id } }),
      ).toBe(2);
    },
  );
});

function binaryParser(
  response: request.Response,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
}
