// lib/store.ts
import { create } from 'zustand';

interface UserState {
  user: {
    id: string;
    email: string;
    name?: string;
    role: 'USER' | 'ADMIN';
  } | null;
  setUser: (user: UserState['user']) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));