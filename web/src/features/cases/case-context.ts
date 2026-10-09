import { createContext, useContext } from 'react';
import type { CaseRecord } from '../../lib/types';
export const CaseContext = createContext<CaseRecord | null>(null);
export function useCase(): CaseRecord {
  const record = useContext(CaseContext);
  if (!record) throw new Error('CaseLayout is required');
  return record;
}
