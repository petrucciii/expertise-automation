import type { Json, JsonObject, ReportSection } from './types';

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function stringArray(value: Json | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
export function reportSections(content: JsonObject): ReportSection[] {
  if (!Array.isArray(content.sections)) return [];
  return content.sections.flatMap((section) =>
    isObject(section) && typeof section.id === 'string'
      ? [
          {
            id: section.id,
            heading:
              typeof section.heading === 'string'
                ? section.heading
                : section.id,
            paragraphs: Array.isArray(section.paragraphs)
              ? stringArray(section.paragraphs)
              : typeof section.paragraph === 'string'
                ? [section.paragraph]
                : [],
            sourceCodes: stringArray(section.sourceCodes),
            ...(typeof section.emptyText === 'string'
              ? { emptyText: section.emptyText }
              : {}),
          },
        ]
      : [],
  );
}
