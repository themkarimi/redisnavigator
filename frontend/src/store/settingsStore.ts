import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MaskingPattern } from '@/utils/masking';

export type { MaskingPattern };

interface SettingsStore {
  scanCount: number;
  setScanCount: (count: number) => void;
  maskingPatterns: MaskingPattern[];
  addMaskingPattern: (pattern: MaskingPattern) => void;
  updateMaskingPattern: (id: string, updates: Partial<Omit<MaskingPattern, 'id'>>) => void;
  removeMaskingPattern: (id: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      scanCount: 100,
      setScanCount: (scanCount) => set({ scanCount }),
      maskingPatterns: [],
      addMaskingPattern: (pattern) =>
        set((s) => ({ maskingPatterns: [...s.maskingPatterns, pattern] })),
      updateMaskingPattern: (id, updates) =>
        set((s) => ({
          maskingPatterns: s.maskingPatterns.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
      removeMaskingPattern: (id) =>
        set((s) => ({ maskingPatterns: s.maskingPatterns.filter((p) => p.id !== id) })),
    }),
    { name: 'redis-navigator-settings' }
  )
);
