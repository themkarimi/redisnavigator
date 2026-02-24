import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

interface Features {
  configAsCode: boolean;
  disabledCommands: string[];
}

export function useFeatures() {
  return useQuery<Features>({
    queryKey: ['features'],
    queryFn: async () => {
      const { data } = await api.get<Features>('/features');
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
