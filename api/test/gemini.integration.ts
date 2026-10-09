import assert from 'node:assert/strict';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { ConsoleLogger, HttpException } from '@nestjs/common';
import { GeminiGenerateContentService } from '../src/ai/gemini-generate-content.service.js';
import { sectorExamples } from './fixtures/cargo-documents.js';
import { cargoDocx } from './fixtures/cargo-documents.js';
import { Test } from '@nestjs/testing';
import { PasswordHasher, TokenService } from '@nestjs/authentication';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../dist/prisma/prisma.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env'), quiet: true });
let livePhase = 'provider protocol';

// Opt-in provider smoke test: only synthetic cargo text leaves the computer.
const schema = {
  type: 'object',
  properties: {
    containers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          cartons: { type: 'integer' },
          pallets: { type: 'integer' },
          excerpt: { type: 'string' },
        },
        required: ['id', 'cartons', 'pallets', 'excerpt'],
        additionalProperties: false,
      },
    },
    epistemicStatus: { type: 'string', enum: ['STATED_IN_DOCUMENT'] },
  },
  required: ['containers', 'epistemicStatus'],
  additionalProperties: false,
};
try {
  const input = sectorExamples.seaWaybill.join('\n');
  const response =
    await new GeminiGenerateContentService().createStructuredResponse({
      instructions:
        'Extract only the two container declarations from this synthetic waybill. Keep each container separate and cite its exact line. Do not infer surveyed quantities, damage, cause or liability.',
      input,
      schema,
    });
  const value = response.value as {
    containers: Array<{
      id: string;
      cartons: number;
      pallets: number;
      excerpt: string;
    }>;
    epistemicStatus: string;
  };
  assert.equal(value.containers.length, 2);
  assert.deepEqual(
    value.containers
      .map(({ id, cartons, pallets }) => ({ id, cartons, pallets }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    [
      { id: 'TEST000001', cartons: 1080, pallets: 29 },
      { id: 'TEST000002', cartons: 894, pallets: 34 },
    ],
  );
  for (const container of value.containers)
    assert.ok(
      container.excerpt.length > 8 && input.includes(container.excerpt),
    );
  console.log(
    `Live Gemini extraction passed with ${response.model}. Both declared container loads and exact source citations were preserved.`,
  );
  await verifyWorkflow();
} catch (error) {
  const status =
    error instanceof HttpException ? error.getStatus() : 'validation failure';
  let diagnostic =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'Unknown failure';
  for (const name of ['GEMINI_API_KEY', 'JWT_SECRET', 'DATABASE_URL'])
    if (process.env[name])
      diagnostic = diagnostic.replaceAll(process.env[name]!, '[redacted]');
  diagnostic = diagnostic.replace(
    /postgres(?:ql)?:\/\/\S+/gi,
    '[database URI]',
  );
  console.error(
    `Live Gemini workflow was not verified at ${livePhase} (${status}). ${diagnostic.slice(0, 800)}`,
  );
  process.exitCode = 1;
}

/** Exercise the real provider and all four output formats without touching a real account or database. */
async function verifyWorkflow(): Promise<void> {
  const saved = { ...process.env };
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'expertise-gemini-live-'),
  );
  let app: INestApplication | undefined;
  let container:
    | Awaited<ReturnType<InstanceType<typeof PostgreSqlContainer>['start']>>
    | undefined;
  const extractionFailures: string[] = [];
  try {
    livePhase = 'temporary database setup';
    container = await new PostgreSqlContainer('postgres:18.6')
      .withDatabase('synthetic_live_cases')
      .withPassword(randomBytes(32).toString('hex'))
      .start();
    Object.assign(process.env, {
      DATABASE_URL: container.getConnectionUri(),
      JWT_SECRET: randomBytes(48).toString('base64url'),
      DOCUMENT_STORAGE_DIR: directory,
      NODE_ENV: 'test',
      FRONTEND_ORIGINS: 'http://localhost:5173',
      REFRESH_COOKIE_SAME_SITE: 'lax',
    });
    await promisify(execFile)(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env: process.env, timeout: 60_000 },
    );
    livePhase = 'Nest application setup';
    const { AppModule } = await import(
      pathToFileURL(path.resolve('dist/app.module.js')).href
    );
    const { configureApp } = await import(
      pathToFileURL(path.resolve('dist/configure-app.js')).href
    );
    const { PrismaService: PrismaProvider } = await import(
      pathToFileURL(path.resolve('dist/prisma/prisma.service.js')).href
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(
        new ConsoleLogger({ logLevels: ['error', 'warn'], colors: false }),
      )
      .compile();
    app = module.createNestApplication({ logger: ['error', 'warn'] });
    configureApp(app);
    await app.init();
    const prisma = app.get<PrismaService>(PrismaProvider);
    const user = await prisma.user.create({
      data: {
        email: 'synthetic-live@example.test',
        passwordHash: await app
          .get(PasswordHasher)
          .hash(randomBytes(24).toString('base64url')),
      },
    });
    const token = (
      await app.get(TokenService).issue(String(user.id), { method: 'password' })
    ).accessToken;
    const http = () => request(app!.getHttpServer());
    const headers = {
      Authorization: `Bearer ${token}`,
      Origin: 'http://localhost:5173',
    };
    const examples: Array<[string, string[][]]> = [
      ['sea', [sectorExamples.seaWaybill, sectorExamples.warehouseTally]],
      ['road', [sectorExamples.roadSurvey]],
      ['air', [sectorExamples.airClaim]],
      ['rail', [sectorExamples.railShortage]],
    ];
    for (const [mode, documents] of examples) {
      livePhase = `${mode} case setup`;
      const caseResponse = await http()
        .post('/api/cases')
        .set(headers)
        .send({ title: `Synthetic live ${mode} case` })
        .expect(201);
      const caseId = caseResponse.body.id as string;
      let accepted = 0;
      let successfulDocuments = 0;
      for (const [index, lines] of documents.entries()) {
        livePhase = `${mode} document ${index + 1} extraction`;
        try {
          const uploaded = await http()
            .post('/api/documents/upload')
            .set(headers)
            .attach(
              'file',
              await cargoDocx(lines),
              `${mode}-${index}-synthetic.docx`,
            )
            .expect(201);
          const source = await http()
            .post(`/api/cases/${caseId}/documents`)
            .set(headers)
            .send({ documentId: uploaded.body.id })
            .expect(201);
          const proposal = await http()
            .post(
              `/api/cases/${caseId}/documents/${source.body.sourceCode}/extract`,
            )
            .set(headers);
          assert.equal(
            proposal.status,
            201,
            `Document extraction returned HTTP ${proposal.status}: ${String(proposal.body.message)}`,
          );
          const suggestions = proposal.body.suggestions as Array<{
            id: string;
            kind: string;
            content: {
              epistemicStatus: string;
              excerpt: string;
              pageNumber: number | null;
            };
          }>;
          assert.ok(
            suggestions.length > 0,
            `No usable ${mode} suggestions were returned`,
          );
          const extracted = await http()
            .get(`/api/documents/${uploaded.body.id}/content`)
            .set(headers)
            .expect(200);
          for (const suggestion of suggestions) {
            assert.notEqual(suggestion.content.epistemicStatus, 'OBSERVED');
            assert.ok(
              extracted.body.content
                .replace(/\s+/g, ' ')
                .includes(suggestion.content.excerpt.replace(/\s+/g, ' ')),
            );
          }
          // The approval here simulates a reviewer only in this isolated synthetic test.
          await http()
            .post(`/api/cases/${caseId}/extractions/${proposal.body.id}/accept`)
            .set(headers)
            .send({
              suggestionIds: suggestions.map((suggestion) => suggestion.id),
            })
            .expect(200);
          accepted += suggestions.length;
          successfulDocuments += 1;
        } catch (error) {
          const diagnostic =
            error instanceof Error
              ? error.message
              : 'Unknown extraction failure';
          extractionFailures.push(`${livePhase}: ${diagnostic.slice(0, 400)}`);
          console.error(
            `Live extraction failed for ${mode} document ${index + 1}; the remaining synthetic modes will still be tested.`,
          );
        }
      }
      const generated = await http()
        .post(`/api/cases/${caseId}/artifacts/generate`)
        .set(headers)
        .expect(201);
      livePhase = `${mode} artifact exports`;
      const artifacts = generated.body as Array<{ id: string; type: string }>;
      assert.equal(artifacts.length, 4);
      for (const artifact of artifacts) {
        if (
          ['PRELIMINARY_REVIEW', 'SURVEY_REPORT_DRAFT'].includes(artifact.type)
        )
          await http()
            .patch(`/api/cases/${caseId}/artifacts/${artifact.id}/approve`)
            .set(headers)
            .expect(200);
        const exported = await http()
          .get(`/api/cases/${caseId}/artifacts/${artifact.type}/latest/export`)
          .set(headers)
          .expect(200);
        assert.ok(
          exported.headers['content-disposition'].includes('attachment'),
        );
        if (artifact.type === 'STRUCTURED_CASE')
          assert.equal(exported.body.schema_version, '1.0');
        else
          assert.ok(
            exported.headers['content-type'].includes(
              artifact.type === 'DOCUMENT_REGISTER'
                ? 'spreadsheetml'
                : 'wordprocessingml',
            ),
          );
      }
      console.log(
        `${mode.toUpperCase()}: ${successfulDocuments}/${documents.length} live document extractions and ${accepted} source-checked suggestions. All four exports passed for the resulting ${successfulDocuments === documents.length ? 'complete' : 'incomplete'} synthetic case.`,
      );
    }
    livePhase = 'completed sector checks';
    if (extractionFailures.length)
      throw new Error(
        `Live sector checks are incomplete:\n${extractionFailures.join('\n')}`,
      );
  } finally {
    if (app) await app.close();
    if (container) await container.stop();
    const absolute = path.resolve(directory);
    if (
      path.dirname(absolute) === path.resolve(os.tmpdir()) &&
      path.basename(absolute).startsWith('expertise-gemini-live-')
    )
      await fs.rm(absolute, { recursive: true, force: true });
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}
