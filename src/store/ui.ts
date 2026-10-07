import { create } from 'zustand';
import type { DateStr, TxType } from '../lib/types';

export interface Toast {
  id: number;
  title: string;
  subtitle?: string;
  action?: { label: string; run: () => void };
  tone?: 'default' | 'error';
}

export type Sheet =
  | { type: 'task'; taskId?: string; dueDate?: DateStr }
  | { type: 'shopping'; shoppingId?: string }
  | { type: 'purchase'; shoppingId?: string; itemId?: string }
  | { type: 'item'; itemId: string }
  | { type: 'household' }
  | { type: 'transaction'; transactionId?: string; txType?: TxType; date?: DateStr }
  | { type: 'categories'; txType: TxType }
  | { type: 'money-category'; categoryId: string; month: string; txType: TxType };

interface UiState {
  toast: Toast | null;
  showToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: () => void;
  /** Keyed so reopening the same sheet type remounts it with fresh form state. */
  sheet: (Sheet & { key: number }) | null;
  sheetOpen: boolean;
  openSheet: (s: Sheet) => void;
  closeSheet: () => void;
  /** Whose tasks Home and Tasks show; null = everyone. Shared by both screens, remembered per device. */
  assignee: string | null;
  setAssignee: (id: string | null) => void;
}

const ASSIGNEE_KEY = 'namin:assignee-filter';
function readAssignee(): string | null {
  try {
    return localStorage.getItem(ASSIGNEE_KEY);
  } catch {
    return null;
  }
}

let nextId = 1;

export const useUi = create<UiState>((set) => ({
  toast: null,
  showToast: (t) => set({ toast: { ...t, id: nextId++ } }),
  dismissToast: () => set({ toast: null }),
  sheet: null,
  sheetOpen: false,
  openSheet: (s) => set({ sheet: { ...s, key: nextId++ }, sheetOpen: true }),
  // Keep `sheet` around so the closing animation still has content to render.
  closeSheet: () => set({ sheetOpen: false }),
  assignee: readAssignee(),
  setAssignee: (id) => {
    try {
      if (id) localStorage.setItem(ASSIGNEE_KEY, id);
      else localStorage.removeItem(ASSIGNEE_KEY);
    } catch {
      /* preference only */
    }
    set({ assignee: id });
  },
}));

/** Unassigned ("Anyone") tasks show under every person, since anyone can do them. */
export const matchesAssignee = (assigneeId: string | null, filter: string | null) => !filter || !assigneeId || assigneeId === filter;

export const toast = (t: Omit<Toast, 'id'>) => useUi.getState().showToast(t);
export const openSheet = (s: Sheet) => useUi.getState().openSheet(s);
export const closeSheet = () => useUi.getState().closeSheet();
