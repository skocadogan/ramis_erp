import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
    collapsed: boolean;
    openGroups: Record<string, boolean>;
    setCollapsed: (collapsed: boolean) => void;
    toggleCollapsed: () => void;
    setGroupOpen: (groupId: string, isOpen: boolean) => void;
    toggleGroup: (groupId: string) => void;
}

export const useSidebarStore = create<SidebarState>()(
    persist(
        (set) => ({
            collapsed: false,
            openGroups: {
                definitions: false,
                restaurant: false,
                kitchen: false
            },
            setCollapsed: (collapsed) => set({ collapsed }),
            toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
            setGroupOpen: (groupId, isOpen) => set((state) => ({
                openGroups: { ...state.openGroups, [groupId]: isOpen }
            })),
            toggleGroup: (groupId) => set((state) => ({
                openGroups: { ...state.openGroups, [groupId]: !state.openGroups[groupId] }
            })),
        }),
        {
            name: 'sidebar_state',
        }
    )
);
