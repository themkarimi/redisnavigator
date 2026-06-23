import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ServerInfo, MemoryAnalysis } from '../types';

export function useServerInfo(connectionId: string | null) {
  return useQuery({
    queryKey: ['server-info', connectionId],
    queryFn: async () => {
      const { data } = await api.get<ServerInfo>(`/connections/${connectionId}/info`);
      return data;
    },
    enabled: !!connectionId,
    refetchInterval: 5000,
  });
}

export function useSlowLog(connectionId: string | null) {
  return useQuery({
    queryKey: ['slowlog', connectionId],
    queryFn: async () => {
      const { data } = await api.get(`/connections/${connectionId}/slowlog`);
      return data;
    },
    enabled: !!connectionId,
  });
}

export function useClientList(connectionId: string | null) {
  return useQuery({
    queryKey: ['client-list', connectionId],
    queryFn: async () => {
      const { data } = await api.get<{ clients: Record<string, string>[] }>(
        `/connections/${connectionId}/clients`
      );
      return data.clients;
    },
    enabled: !!connectionId,
    refetchInterval: 5000,
  });
}

export function useRedisConfig(connectionId: string | null) {
  return useQuery({
    queryKey: ['redis-config', connectionId],
    queryFn: async () => {
      const { data } = await api.get<{ config: Record<string, string> }>(
        `/connections/${connectionId}/config`
      );
      return data.config;
    },
    enabled: !!connectionId,
  });
}

// Memory analysis SCANs the keyspace, so it is expensive — only run on demand
// (the page enables it via the `enabled` flag and re-runs with refetch).
export function useMemoryAnalysis(
  connectionId: string | null,
  sample: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['memory-analysis', connectionId, sample],
    queryFn: async () => {
      const { data } = await api.get<MemoryAnalysis>(
        `/connections/${connectionId}/memory`,
        { params: { sample } }
      );
      return data;
    },
    enabled: !!connectionId && enabled,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}
