import { create } from 'zustand';

interface UIState {
    sidebarOpen: boolean;
    selectedMonth: string; // YYYY-MM
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    setSelectedMonth: (month: string) => void;
}

const getCurrentMonth = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const useUIStore = create<UIState>((set) => ({
    sidebarOpen: true,
    selectedMonth: getCurrentMonth(),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setSelectedMonth: (month) => set({ selectedMonth: month }),
}));

// ============== IMPORT STATE ==============

interface ImportState {
    isImporting: boolean;
    progress: number; // 0-100
    currentFile: string | null;
    errors: string[];
    setImporting: (importing: boolean) => void;
    setProgress: (progress: number) => void;
    setCurrentFile: (file: string | null) => void;
    addError: (error: string) => void;
    clearErrors: () => void;
    reset: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
    isImporting: false,
    progress: 0,
    currentFile: null,
    errors: [],
    setImporting: (importing) => set({ isImporting: importing }),
    setProgress: (progress) => set({ progress }),
    setCurrentFile: (file) => set({ currentFile: file }),
    addError: (error) => set((state) => ({ errors: [...state.errors, error] })),
    clearErrors: () => set({ errors: [] }),
    reset: () => set({ isImporting: false, progress: 0, currentFile: null, errors: [] }),
}));
