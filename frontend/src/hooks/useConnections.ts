import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { RedisConnection } from '../types';
import { useConnectionStore } from '../store/connectionStore';
import { useEffect } from 'react';

export function useConnections() {
  const { setConnections } = useConnectionStore();

  const query = useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const { data } = await api.get<RedisConnection[]>('/connections');
      return data;
    },
  });

  useEffect(() => {
    if (query.data) setConnections(query.data);
  }, [query.data, setConnections]);

  return query;
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<RedisConnection> & { password?: string }) => {
      const { data: conn } = await api.post<RedisConnection>('/connections', data);
      return conn;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RedisConnection> & { password?: string } }) => {
      const { data: conn } = await api.patch<RedisConnection>(`/connections/${id}`, data);
      return conn;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connections/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: async (data: Partial<RedisConnection> & { password?: string }) => {
      const { data: result } = await api.post('/connections/test', data);
      return result as { success: boolean; latency?: number; error?: string };
    },
  });
}

export function useTestExistingConnection() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: result } = await api.post(`/connections/${id}/test`);
      return result as { success: boolean; latency?: number; error?: string };
    },
  });
}
