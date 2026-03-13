import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MonthSelector } from './MonthSelector';
import { useUIStore } from '../store/uiStore';
import { cn } from '../lib/utils';

export function Layout() {
    const sidebarOpen = useUIStore((s) => s.sidebarOpen);

    return (
        <div className="min-h-screen bg-surface-900">
            <Sidebar />

            {/* Main Content */}
            <main
                className={cn(
                    'transition-all duration-300 ease-out min-h-screen',
                    sidebarOpen ? 'ml-64' : 'ml-20'
                )}
            >
                {/* Top Bar */}
                <header className="h-16 border-b border-surface-300 bg-surface-100/50 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between px-6">
                    <MonthSelector />
                    <div className="flex items-center gap-4">
                        {/* Future: notifications, theme toggle, etc */}
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-6">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
