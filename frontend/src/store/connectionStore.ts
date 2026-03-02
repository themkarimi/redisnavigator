import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RedisConnection } from '../types';

interface ConnectionStore {
  connections: RedisConnection[];
  activeConnectionId: string | null;
  setConnections: (connections: RedisConnection[]) => void;
  setActiveConnection: (id: string | null) => void;
  addConnection: (connection: RedisConnection) => void;
  updateConnection: (id: string, data: Partial<RedisConnection>) => void;
  removeConnection: (id: string) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connections: [],
      activeConnectionId: null,
      setConnections: (connections) => set({ connections }),
      setActiveConnection: (id) => set({ activeConnectionId: id }),
      addConnection: (connection) =>
        set((state) => ({ connections: [...state.connections, connection] })),
      updateConnection: (id, data) =>
        set((state) => ({
          connections: state.connections.map((c) => (c.id === id ? { ...c, ...data } : c)),
        })),
      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
        })),
    }),
    {
      name: 'redis-navigator-connection',
      partialize: (state) => ({ activeConnectionId: state.activeConnectionId }),
    }
  )
);
