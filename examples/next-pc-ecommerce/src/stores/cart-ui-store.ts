"use client";

import { create } from "zustand";

type CartUiState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useCartUiStore = create<CartUiState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
