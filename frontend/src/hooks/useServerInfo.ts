import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ServerInfo } from '../types';

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
