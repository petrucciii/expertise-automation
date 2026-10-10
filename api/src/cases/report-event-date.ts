/** Preserve date semantics in prose and exports instead of implying an occurrence date. */
export function describeEventDate(
  date: Date | string | null,
  dateType: string,
): string {
  if (!date) return '';
  const value =
    typeof date === 'string'
      ? date.slice(0, 10)
      : date.toISOString().slice(0, 10);
  const labels: Record<string, string> = {
    EVENT: 'Data dell’evento',
    DOCUMENT: 'Data del documento',
    RECEIVED: 'Data di ricezione',
    UNKNOWN: 'Data registrata (significato non verificato)',
  };
  const label = Object.hasOwn(labels, dateType)
    ? labels[dateType]
    : labels.UNKNOWN;
  return `${label}: ${value}`;
}
