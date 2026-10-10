import type { Json } from './types';

export function parseJsonInput(text: string): Json {
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    throw new Error(
      'JSON non valido. Controlla parentesi, virgolette e valori.',
    );
  }

  // JSON.parse accepts overflowing numbers (1e400). JSON.stringify then
  // changes Infinity to null, so reject them before a user's data is sent.
  // The request body adds one level. Match the API's 32-level bound before
  // JSON.stringify or a server-side transformer can recurse into pasted data.
  const pending = [{ value: parsed, depth: 1 }];
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error(
        'Il JSON contiene un numero troppo grande. Correggi il valore prima di salvare.',
      );
    if (value !== null && typeof value === 'object') {
      if (depth > 32)
        throw new Error(
          'Il JSON è troppo annidato. Semplifica la struttura prima di salvare.',
        );
      for (const item of Object.values(value))
        pending.push({ value: item, depth: depth + 1 });
    }
  }
  return parsed;
}
