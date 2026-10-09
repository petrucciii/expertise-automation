import { ValidateIf, Matches } from 'class-validator';

/** Unlike IsOptional, this allows omission but still validates an explicit null. */
export const OptionalField = () =>
  ValidateIf((_object, value: unknown) => value !== undefined);

/** Whitespace is not meaningful input for titles, messages, or field identifiers. */
export const HasText = () =>
  Matches(/\S/, { message: '$property must contain non-whitespace text' });
