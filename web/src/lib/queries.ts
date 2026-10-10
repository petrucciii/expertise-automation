import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function useCases() {
  return useInfiniteQuery({
    queryKey: ['cases'],
    queryFn: ({ pageParam }) => api.cases(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, offset) =>
      last.length === 50 && offset < 100000 ? offset + 50 : undefined,
  });
}
export function useDocuments() {
  return useInfiniteQuery({
    queryKey: ['documents'],
    queryFn: ({ pageParam }) => api.documents(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, offset) =>
      last.length === 50 && offset < 100000 ? offset + 50 : undefined,
  });
}
export function useChats(caseId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['chats', caseId],
    queryFn: ({ pageParam }) => api.chats(caseId!, pageParam),
    enabled: Boolean(caseId),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, offset) =>
      last.length === 50 && offset < 100000 ? offset + 50 : undefined,
  });
}
export function useInvalidateCase(caseId: string) {
  const cache = useQueryClient();
  return async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['case', caseId] }),
      cache.invalidateQueries({ queryKey: ['cases'] }),
      cache.invalidateQueries({ queryKey: ['artifacts', caseId] }),
      cache.invalidateQueries({ queryKey: ['latest', caseId] }),
      cache.invalidateQueries({ queryKey: ['versions', caseId] }),
      cache.invalidateQueries({ queryKey: ['register', caseId] }),
      cache.invalidateQueries({ queryKey: ['proposals', caseId] }),
    ]);
  };
}
