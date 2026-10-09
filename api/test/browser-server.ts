import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConsoleLogger, type INestApplication } from '@nestjs/common';
import { getStorageToken } from '@nestjs/throttler';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';

// This entry point always creates its own database/storage and never loads application secrets.
let app: INestApplication | undefined;
let database: StartedPostgreSqlContainer | undefined;
let directory: string | undefined;
let stopping = false;
let phase = 'temporary database setup';
const nativeFetch = globalThis.fetch;

async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    globalThis.fetch = nativeFetch;
    if (app) await app.close();
    if (database) await database.stop();
    if (
      directory &&
      path.dirname(directory) === path.resolve(os.tmpdir()) &&
      path.basename(directory).startsWith('expertise-browser-')
    )
      await fs.rm(directory, { recursive: true, force: true });
  } finally {
    process.exitCode = 0;
  }
}
process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});

try {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expertise-browser-'));
  database = await new PostgreSqlContainer('postgres:18.6')
    .withDatabase('expertise_browser_test')
    .withPassword(randomBytes(32).toString('hex'))
    .start();
  Object.assign(process.env, {
    DATABASE_URL: database.getConnectionUri(),
    JWT_SECRET: randomBytes(48).toString('base64url'),
    GEMINI_API_KEY: 'synthetic-browser-provider',
    DOCUMENT_STORAGE_DIR: directory,
    FRONTEND_ORIGINS: 'http://127.0.0.1:5174',
    REFRESH_COOKIE_SAME_SITE: 'lax',
    NODE_ENV: 'test',
  });
  await promisify(execFile)(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: process.env, timeout: 60_000 },
  );
  phase = 'Nest application setup';
  const { AppModule } = await import(
    pathToFileURL(path.resolve('dist/app.module.js')).href
  );
  const { configureApp } = await import(
    pathToFileURL(path.resolve('dist/configure-app.js')).href
  );
  const module = await Test.createTestingModule({ imports: [AppModule] })
    // Browser tests cover UX rate-limit handling separately; backend HTTP tests cover real counters.
    .overrideProvider(getStorageToken())
    .useValue({
      increment: async () => ({
        totalHits: 1,
        timeToExpire: 60_000,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    })
    .compile();
  app = module.createNestApplication();
  app.useLogger(new ConsoleLogger({ logLevels: ['warn', 'error'] }));
  configureApp(app);
  globalThis.fetch = async (input, options) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.startsWith('https://generativelanguage.googleapis.com/'))
      return nativeFetch(input, options);
    if (typeof options?.body !== 'string')
      throw new Error('Synthetic provider received an unexpected request');
    const body = object(JSON.parse(options.body));
    const contents = body.contents as Array<{
      parts: Array<{ text?: string }>;
    }>;
    const text = contents[0]?.parts[0]?.text || '';
    if (text.includes('SIMULATE_OVERLOAD'))
      return new Response('{}', { status: 503 });
    const schema = object(
      object(object(object(body.generationConfig).responseFormat).text).schema,
    );
    const properties = object(schema.properties);
    let value: unknown;
    if ('facts' in properties) {
      const context = object(JSON.parse(text));
      const pages = Array.isArray(context.pages)
        ? (context.pages as Array<{ pageNumber: number; text: string }>)
        : [];
      const excerpt =
        (
          pages[0]?.text ||
          (typeof context.text === 'string' ? context.text : '')
        )
          .trim()
          .split('\n')
          .find((line) => line.trim().length > 10)
          ?.trim() || '';
      value = {
        documentType: 'other',
        imageDescription: null,
        facts: excerpt
          ? [
              {
                fieldKey: 'cargo.documented_statement',
                valueText: 'Dichiarazione della fonte sintetica',
                numericValue: null,
                unit: null,
                epistemicStatus: 'STATED_IN_DOCUMENT',
                attribution: null,
                pageNumber: pages[0]?.pageNumber || null,
                excerpt,
              },
            ]
          : [],
        events: [],
        openQuestions: [
          'Verificare l’ambito del conteggio e ottenere le fonti mancanti.',
        ],
      };
    } else if ('answer' in properties) {
      const rawContext = text
        .split('CASE CONTEXT (JSON):\n\n')[1]
        ?.split('\n\nRECENT CONVERSATION')[0];
      const context = rawContext ? object(JSON.parse(rawContext)) : {};
      const documents = Array.isArray(context.documents)
        ? (context.documents as Array<{
            id: string;
            text: string;
            pages: Array<{ pageNumber: number; text: string }>;
          }>)
        : [];
      const source = documents.find(
        (document) => document.text || document.pages.length,
      );
      const excerpt =
        source?.pages[0]?.text.slice(0, 100) ||
        source?.text.slice(0, 100) ||
        '';
      value = {
        answer: text.includes('SIMULATE_HOSTILE')
          ? 'Testo della fonte: <img src=x onerror="window.__sourceXss=true">\n\n[Link non sicuro](javascript:alert(1))\n\n![Immagine remota](https://untrusted.example.test/tracker.png)'
          : 'Le fonti registrate vanno verificate dal perito. Le quantità restano distinte per ambito; la causa e il danno accertato non sono determinati.\n\n**Prossimo controllo:** confrontare l’originale e chiarire le questioni aperte.',
        citations:
          source && excerpt
            ? [
                {
                  sourceId: source.id,
                  pageNumber: source.pages[0]?.pageNumber || null,
                  excerpt,
                },
              ]
            : [],
      };
    } else if ('findings' in properties) value = { findings: [] };
    else if ('sections' in properties) value = { sections: [] };
    else throw new Error('Synthetic provider received an unexpected schema');
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify(value) }] },
          },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  };
  phase = 'HTTP listener setup';
  await app.listen(3101, '127.0.0.1');
  console.log(
    'Isolated browser-test API ready on 127.0.0.1:3101 (synthetic Gemini responses).',
  );
} catch (error) {
  console.error(
    `Isolated browser-test API startup failed at ${phase} (${error instanceof Error ? error.name : 'unknown error'}); no application credentials were used.`,
  );
  await stop();
  process.exitCode = 1;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid synthetic provider object');
  return value as Record<string, unknown>;
}
