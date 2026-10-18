import { useCallback, useEffect, useRef } from 'react';
import { api } from './api';

// A session switch unmounts its navigator. Cancel the old screens' requests so
// a late response cannot update the next diary or expire its newer session.
export default function useScopedApi() {
  const requests = useRef(new Set<AbortController>());
  useEffect(() => () => { for (const controller of requests.current) controller.abort(); requests.current.clear(); }, []);
  return useCallback(async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    requests.current.add(controller);
    try { return await api<T>(path, { ...options, signal: controller.signal }); }
    finally { requests.current.delete(controller); }
  }, []);
}
