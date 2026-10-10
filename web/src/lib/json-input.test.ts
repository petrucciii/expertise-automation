import { describe, expect, it } from 'vitest';
import { parseJsonInput } from './json-input';

describe('pasted JSON data', () => {
  it.each(['1e400', '-1e400', '{"weight":[0,{"kg":1e400}]}'])(
    'rejects overflowing numbers without silently replacing them with null: %s',
    (input) => {
      expect(() => parseJsonInput(input)).toThrow('numero troppo grande');
    },
  );

  it('preserves zero, false, null and finite scientific notation', () => {
    expect(
      parseJsonInput('{"zero":0,"false":false,"missing":null,"kg":1e3}'),
    ).toEqual({ zero: 0, false: false, missing: null, kg: 1000 });
  });

  it('explains invalid syntax in the language of the form', () => {
    expect(() => parseJsonInput('{"kg":}')).toThrow('JSON non valido');
  });

  it('accepts the API nesting boundary including the request wrapper', () => {
    expect(() =>
      parseJsonInput('['.repeat(32) + '0' + ']'.repeat(32)),
    ).not.toThrow();
  });
  it('rejects nesting beyond the API boundary before transport serialization', () => {
    expect(() =>
      parseJsonInput('['.repeat(8000) + '0' + ']'.repeat(8000)),
    ).toThrow('troppo annidato');
  });
});
