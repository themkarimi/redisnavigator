import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeStore {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

function systemTheme(): 'dark' | 'light' {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: systemTheme(),
      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: newTheme });
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      },
    }),
    { name: 'redis-navigator-theme' }
  )
);
