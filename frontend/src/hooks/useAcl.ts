import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { AclUserSummary, AclUserDetail, AclUserInput } from '../types';

export function useAclUsers(connectionId: string | null) {
  return useQuery({
    queryKey: ['acl', connectionId],
    queryFn: async () => {
      const { data } = await api.get<{ users: AclUserSummary[] }>(`/connections/${connectionId}/acl`);
      return data.users;
    },
    enabled: !!connectionId,
  });
}

export function useAclUser(connectionId: string | null, username: string | null) {
  return useQuery({
    queryKey: ['acl-user', connectionId, username],
    queryFn: async () => {
      const { data } = await api.get<AclUserDetail>(`/connections/${connectionId}/acl/${encodeURIComponent(username!)}`);
      return data;
    },
    enabled: !!connectionId && !!username,
  });
}

export function useAclCategories(connectionId: string | null) {
  return useQuery({
    queryKey: ['acl-categories', connectionId],
    queryFn: async () => {
      const { data } = await api.get<{ categories: string[] }>(`/connections/${connectionId}/acl/categories`);
      return data.categories;
    },
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateAclUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, ...body }: { connectionId: string } & AclUserInput) => {
      const { data } = await api.post(`/connections/${connectionId}/acl`, body);
      return data as { message: string; username: string };
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['acl', vars.connectionId] }),
  });
}

export function useUpdateAclUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, username, ...body }: { connectionId: string; username: string } & AclUserInput) => {
      const { data } = await api.put(`/connections/${connectionId}/acl/${encodeURIComponent(username)}`, body);
      return data as { message: string; username: string };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['acl', vars.connectionId] });
      qc.invalidateQueries({ queryKey: ['acl-user', vars.connectionId, vars.username] });
    },
  });
}

export function useSaveAcl() {
  return useMutation({
    mutationFn: async ({ connectionId }: { connectionId: string }) => {
      const { data } = await api.post(`/connections/${connectionId}/acl/save`);
      return data as { message: string };
    },
  });
}

export function useDeleteAclUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, username }: { connectionId: string; username: string }) => {
      await api.delete(`/connections/${connectionId}/acl/${encodeURIComponent(username)}`);
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['acl', vars.connectionId] }),
  });
}
