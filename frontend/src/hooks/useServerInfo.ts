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
