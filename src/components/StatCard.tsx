import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: ReactNode;
    trend?: {
        value: number;
        label: string;
    };
    variant?: 'default' | 'success' | 'warning' | 'danger';
    className?: string;
    onClick?: () => void;
}

export function StatCard({
    title,
    value,
    subtitle,
    icon,
    trend,
    variant = 'default',
    className,
    onClick
}: StatCardProps) {
    const variantStyles = {
        default: 'from-primary-500/20 to-transparent',
        success: 'from-success/20 to-transparent',
        warning: 'from-warning/20 to-transparent',
        danger: 'from-danger/20 to-transparent',
    };

    return (
        <div
            className={cn(
                'card p-5 relative overflow-hidden',
                onClick && 'cursor-pointer hover:bg-surface-800/50 transition-colors',
                className
            )}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {/* Background gradient */}
            <div className={cn(
                'absolute inset-0 bg-gradient-to-br opacity-50',
                variantStyles[variant]
            )} />

            <div className="relative">
                <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-text-secondary">{title}</span>
                    {icon && (
                        <div className="p-2 rounded-lg bg-surface-700/50">
                            {icon}
                        </div>
                    )}
                </div>

                <div className="text-2xl font-bold text-text-primary mb-1">{value}</div>

                {subtitle && (
                    <p className="text-sm text-text-muted">{subtitle}</p>
                )}

                {trend && (
                    <div className={cn(
                        'flex items-center gap-1 mt-2 text-sm font-medium',
                        trend.value > 0 ? 'text-danger' : 'text-success'
                    )}>
                        <span>{trend.value > 0 ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
                        <span className="text-text-muted font-normal">{trend.label}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
