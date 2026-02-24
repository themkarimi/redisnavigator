import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  scanCount: number;
  setScanCount: (count: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      scanCount: 100,
      setScanCount: (scanCount) => set({ scanCount }),
    }),
    { name: 'redis-navigator-settings' }
  )
);
