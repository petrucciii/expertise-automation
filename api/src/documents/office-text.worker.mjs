import { parentPort, workerData } from 'node:worker_threads';
import mammoth from 'mammoth';

// Keep untrusted XML parsing off the HTTP thread. The parent enforces memory and time limits.
try {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(workerData),
  });
  parentPort.postMessage({ content: result.value.slice(0, 2_000_001) });
} catch {
  parentPort.postMessage({ error: true });
}
