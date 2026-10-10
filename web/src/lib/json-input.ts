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
  // Iterate rather than recurse to handle deeply nested pasted input safely.
  const pending: Json[] = [parsed];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error(
        'Il JSON contiene un numero troppo grande. Correggi il valore prima di salvare.',
      );
    if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) pending.push(item);
    }
  }
  return parsed;
}
