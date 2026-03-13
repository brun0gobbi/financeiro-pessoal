import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Inbox,
    FileUp,
    History,
    Settings,
    ChevronLeft,
    Wallet,
    CreditCard,
    ChevronDown,
    Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useUIStore } from '../store/uiStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useState, useEffect } from 'react';

const navItems = [
    {
        label: 'Dashboards',
        icon: LayoutDashboard,
        children: [
            { to: '/', label: 'Visão Geral', icon: LayoutDashboard },
            { to: '/itau', label: 'Itaú', icon: CreditCard },
            { to: '/cartoes', label: 'Cartões (Nu + XP)', icon: CreditCard },
            { to: '/nubank', label: 'Nubank', icon: CreditCard },
            { to: '/xp', label: 'XP', icon: CreditCard }
        ]
    },
    { to: '/tempo-real', icon: Clock, label: 'Tempo Real' },
    { to: '/pendencias', icon: Inbox, label: 'Pendências' },
    { to: '/importar', icon: FileUp, label: 'Importar' },
    { to: '/historico', icon: History, label: 'Extrato' },
    { to: '/configuracoes', icon: Settings, label: 'Configurações' },
];

export function Sidebar() {
    const { sidebarOpen, toggleSidebar } = useUIStore();
    const [dashboardsOpen, setDashboardsOpen] = useState(true);
    const location = useLocation();

    // Auto-expand dashboards menu if current path matches one of its children
    useEffect(() => {
        if (['/', '/cartoes', '/nubank', '/xp', '/itau'].includes(location.pathname)) {
            setDashboardsOpen(true);
        }
    }, [location.pathname]);

    // Count pending transactions
    const pendingCount = useLiveQuery(
        () => db.transactions.where('statusRevisao').equals('PENDENTE').count(),
        []
    );

    return (
        <aside
            className={cn(
                'fixed left-0 top-0 h-screen z-40 transition-all duration-300 ease-out',
                'bg-surface-800 border-r border-surface-700',
                sidebarOpen ? 'w-64' : 'w-20'
            )}
        >
            {/* Logo */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-surface-700">
                <div className={cn('flex items-center gap-3 overflow-hidden', !sidebarOpen && 'justify-center')}>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shrink-0">
                        <Wallet className="w-5 h-5 text-white" />
                    </div>
                    {sidebarOpen && (
                        <span className="text-lg font-semibold text-gradient whitespace-nowrap">
                            Financeiro
                        </span>
                    )}
                </div>
                <button
                    onClick={toggleSidebar}
                    className={cn(
                        'p-2 rounded-lg hover:bg-surface-700 transition-colors',
                        !sidebarOpen && 'absolute -right-3 top-6 bg-surface-700 rounded-full shadow-lg'
                    )}
                >
                    <ChevronLeft className={cn('w-4 h-4 transition-transform', !sidebarOpen && 'rotate-180')} />
                </button>
            </div>

            {/* Navigation */}
            <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-4rem)]">
                {navItems.map((item, index) => {
                    // Handle items with children (Dropdowns)
                    if (item.children) {
                        return (
                            <div key={index} className="space-y-1">
                                <button
                                    onClick={() => {
                                        if (!sidebarOpen) toggleSidebar();
                                        setDashboardsOpen(!dashboardsOpen);
                                    }}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                                        'hover:bg-surface-700 text-text-secondary hover:text-text-primary group relative',
                                        !sidebarOpen && 'justify-center px-0'
                                    )}
                                >
                                    <item.icon className="w-5 h-5 shrink-0" />
                                    {sidebarOpen && (
                                        <>
                                            <span className="font-medium flex-1 text-left">{item.label}</span>
                                            <ChevronDown className={cn("w-4 h-4 transition-transform", dashboardsOpen && "rotate-180")} />
                                        </>
                                    )}

                                    {/* Tooltip when collapsed */}
                                    {!sidebarOpen && (
                                        <div className="absolute left-full ml-2 px-3 py-2 bg-surface-700 rounded-lg text-sm font-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                                            {item.label}
                                        </div>
                                    )}
                                </button>

                                {/* Submenu */}
                                {item.children && (
                                    <div className={cn(
                                        "overflow-hidden transition-all duration-300 ease-in-out",
                                        dashboardsOpen && sidebarOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                                    )}>
                                        <div className="pl-4 space-y-1">
                                            {item.children.map((child) => (
                                                <NavLink
                                                    key={child.to}
                                                    to={child.to}
                                                    className={({ isActive }) => cn(
                                                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                                                        isActive
                                                            ? 'bg-primary-500/10 text-primary-400 font-medium'
                                                            : 'text-text-muted hover:text-text-primary hover:bg-surface-700/50'
                                                    )}
                                                >
                                                    {child.icon ? <child.icon className="w-4 h-4" /> : <div className="w-4 h-4" />}
                                                    <span>{child.label}</span>
                                                </NavLink>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    // Handle regular items
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to!}
                            className={({ isActive }) =>
                                cn(
                                    'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                                    'hover:bg-surface-700 group relative',
                                    isActive
                                        ? 'bg-primary-500/10 text-primary-400 border-l-2 border-primary-500'
                                        : 'text-text-secondary hover:text-text-primary',
                                    !sidebarOpen && 'justify-center px-0'
                                )
                            }
                        >
                            <item.icon className="w-5 h-5 shrink-0" />
                            {sidebarOpen && <span className="font-medium">{item.label}</span>}

                            {/* Badge for Pendências */}
                            {item.to === '/pendencias' && pendingCount && pendingCount > 0 && (
                                <span className={cn(
                                    'bg-danger text-white text-xs font-bold rounded-full',
                                    sidebarOpen ? 'px-2 py-0.5 ml-auto' : 'absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center'
                                )}>
                                    {pendingCount > 99 ? '99+' : pendingCount}
                                </span>
                            )}

                            {/* Tooltip when collapsed */}
                            {!sidebarOpen && (
                                <div className="absolute left-full ml-2 px-3 py-2 bg-surface-700 rounded-lg text-sm font-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                                    {item.label}
                                </div>
                            )}
                        </NavLink>
                    );
                })}
            </nav>
        </aside>
    );
}
