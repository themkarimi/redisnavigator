import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { RedisKey, RedisKeyDetail } from '../types';

interface KeysResponse {
  keys: RedisKey[];
  cursor: string;
  total: number;
}

export function useKeys(connectionId: string, params: { pattern?: string; type?: string; count?: number } = {}) {
  return useQuery({
    queryKey: ['keys', connectionId, params],
    queryFn: async () => {
      const { data } = await api.get<KeysResponse>(`/connections/${connectionId}/keys`, { params });
      return data;
    },
    enabled: !!connectionId,
  });
}

export function useKeyDetail(connectionId: string, key: string | null) {
  return useQuery({
    queryKey: ['key', connectionId, key],
    queryFn: async () => {
      const { data } = await api.get<RedisKeyDetail>(`/connections/${connectionId}/keys/${encodeURIComponent(key!)}`);
      return data;
    },
    enabled: !!connectionId && !!key,
  });
}

export function useCreateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, ...data }: { connectionId: string; key: string; type: string; value: unknown; ttl?: number }) => {
      const { data: result } = await api.post(`/connections/${connectionId}/keys`, data);
      return result as { message: string; key: string };
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['keys', vars.connectionId] }),
  });
}

export function useUpdateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, key, ...data }: { connectionId: string; key: string; value?: unknown; ttl?: number; field?: string; score?: number; member?: string }) => {
      const { data: result } = await api.patch(`/connections/${connectionId}/keys/${encodeURIComponent(key)}`, data);
      return result;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['key', vars.connectionId, vars.key] });
      qc.invalidateQueries({ queryKey: ['keys', vars.connectionId] });
    },
  });
}

export function useDeleteKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, key }: { connectionId: string; key: string }) => {
      await api.delete(`/connections/${connectionId}/keys/${encodeURIComponent(key)}`);
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['keys', vars.connectionId] }),
  });
}

export function useBulkDeleteKeys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, keys }: { connectionId: string; keys: string[] }) => {
      const { data } = await api.post(`/connections/${connectionId}/keys/bulk-delete`, { keys });
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['keys', vars.connectionId] }),
  });
}
