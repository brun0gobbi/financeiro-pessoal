import { useLiveQuery } from 'dexie-react-hooks';
import {
    TrendingDown,
    CreditCard,
    AlertTriangle,
    PieChart as PieChartIcon,
    Tags,
    ShoppingBag,
    MapPin
} from 'lucide-react';
import { db } from '../db/schema';
import type { Transaction } from '../db/schema';
import { useUIStore } from '../store/uiStore';
import { formatCurrency, getLastNMonths, getMonthName, formatCategoryName, cn } from '../lib/utils';
import { StatCard } from '../components/StatCard';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line,
    Legend,
} from 'recharts';

export const CATEGORY_COLORS = [
    '#dc2626', // moradia - red
    '#16a34a', // mercado - green
    '#f59e0b', // alimentação - amber
    '#2563eb', // transporte - blue
    '#db2777', // saúde - pink
    '#7c3aed', // assinaturas - violet
    '#0891b2', // compras - cyan
    '#0d9488', // viagens - teal
    '#71717a', // impostos - gray
    '#65a30d', // investimentos - lime
];

const getCategoryColor = (category: string | undefined | null) => {
    if (!category) return '#9ca3af'; // gray-400
    const index = Object.keys({
        'moradia': 0, 'mercado': 1, 'alimentacao_lazer': 2, 'transporte': 3,
        'saude': 4, 'assinaturas': 5, 'compras': 6, 'viagens': 7,
        'impostos': 8, 'investimentos': 9
    }).indexOf(category);
    return CATEGORY_COLORS[index] || '#6b7280';
};

// Tooltip style for light theme
const TOOLTIP_STYLE = {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    color: '#1f2937',
};

import { ReviewAssistantWidget } from '../components/ReviewAssistantWidget';
import { QuickCategoryModal } from '../components/QuickCategoryModal';
import { InstallmentsModal } from '../components/InstallmentsModal';
import { DrilldownModal } from '../components/DrilldownModal';
import { getReviewCandidates } from '../lib/utils';
import { learnClassification } from '../services/classifier/engine';
import { useState, useMemo } from 'react';

export interface DashboardProps {
    source?: 'NUBANK' | 'XP';
}

export function Dashboard({ source }: DashboardProps) {
    const selectedMonth = useUIStore((s) => s.selectedMonth);
    const last6Months = getLastNMonths(6).reverse();

    // Review Assistant State
    const [skippedIds, setSkippedIds] = useState<number[]>([]);
    const [manualSelection, setManualSelection] = useState<Transaction | null>(null);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showInstallmentsModal, setShowInstallmentsModal] = useState(false);
    const [drilldownFilter, setDrilldownFilter] = useState<{ type: 'MACRO' | 'SUB', key: string, name: string } | null>(null);

    // Get transactions for selected month
    const monthTransactions = useLiveQuery(
        () => {
            let collection = db.transactions.toCollection();

            // If a specific month is selected, verify index usage if possible, or just filter
            if (selectedMonth !== 'ALL') {
                collection = db.transactions.where('mesCompetencia').equals(selectedMonth);
            } else {
                // If ALL, we might want to just get everything ordered by date
                collection = db.transactions.orderBy('dataEvento').reverse();
            }

            return collection
                .filter((t) => t.statusRevisao === 'OK')
                .filter((t) => !source || t.origem === source)
                .toArray();
        },
        [selectedMonth, source]
    );

    const drilldownTransactions = useMemo(() => {
        if (!drilldownFilter || !monthTransactions) return [];
        return monthTransactions.filter(t => {
            if (t.tipo !== 'DEBITO') return false;
            return drilldownFilter.type === 'MACRO'
                ? t.categoriaMacro === drilldownFilter.key
                : t.categoriaSub === drilldownFilter.key;
        });
    }, [monthTransactions, drilldownFilter]);

    // Derive candidates (Memoized to prevent render loops)
    const reviewCandidates = useMemo(() => {
        if (!monthTransactions) return [];
        const allCandidates = getReviewCandidates(monthTransactions);
        return allCandidates.filter(t => !skippedIds.includes(t.id!));
    }, [monthTransactions, skippedIds]);

    const currentCandidate = reviewCandidates.length > 0 ? reviewCandidates[0] : null;
    const activeTransaction = manualSelection || currentCandidate;

    const handleSkipCandidate = () => {
        if (currentCandidate && currentCandidate.id) {
            setSkippedIds(prev => [...prev, currentCandidate.id!]);
        }
    };

    const handleCategorize = (transaction: Transaction, newCategory: string, newSubCategory: string, learn: boolean, observation: string) => {
        // Update transaction in DB
        db.transactions.update(transaction.id!, {
            categoriaMacro: newCategory,
            categoriaSub: newSubCategory,
            observacao: observation,
            statusRevisao: 'OK', // Explicitly mark as reviewed
            updatedAt: new Date()
        }).then(() => {
            if (learn) {
                learnClassification(transaction, newCategory, newSubCategory);
            }
        });
    };

    // ... rest of queries
    const sixMonthTransactions = useLiveQuery(
        () =>
            db.transactions
                .where('mesCompetencia')
                .anyOf(last6Months)
                .and((t) => t.statusRevisao === 'OK')
                .and((t) => !source || t.origem === source)
                .toArray(),
        [last6Months.join(','), source]
    );

    // Get pending count (Global or Source specific? Let's make it specific for consistency if source provided)
    const pendingCount = useLiveQuery(
        () => db.transactions
            .where('statusRevisao').equals('PENDENTE')
            .and((t) => !source || t.origem === source)
            .count(),
        [source]
    );

    // Calculate stats
    const stats = calculateStats(monthTransactions || []);
    const categoryData = getCategoryData(monthTransactions || []);
    const subcategoryData = getSubcategoryData(monthTransactions || []);
    const evolutionData = getEvolutionData(sixMonthTransactions || [], last6Months);
    const dailyData = getDailyData(monthTransactions || [], selectedMonth);

    const getTitle = () => {
        const period = selectedMonth === 'ALL' ? 'Todo o Período' : getMonthName(selectedMonth);
        if (source === 'NUBANK') return `Nubank - ${period}`;
        if (source === 'XP') return `XP - ${period}`;
        return `Cartões (Nu + XP) - ${period}`;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Review Assistant */}
            {currentCandidate && !manualSelection && (
                <ReviewAssistantWidget
                    transaction={currentCandidate}
                    onCategorize={() => setShowCategoryModal(true)}
                    onSkip={handleSkipCandidate}
                />
            )}

            {activeTransaction && (
                <QuickCategoryModal
                    isOpen={showCategoryModal}
                    transaction={activeTransaction}
                    onClose={() => {
                        setShowCategoryModal(false);
                        setManualSelection(null);
                    }}
                    onSave={handleCategorize}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary capitalize">
                        {getTitle()}
                    </h1>
                    <p className="text-text-secondary">
                        {source
                            ? `Visão detalhada do cartão ${source}`
                            : 'Visão unificada dos cartões'
                        }
                    </p>
                </div>
                {pendingCount && pendingCount > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border border-warning/20 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-warning" />
                        <span className="text-sm text-warning font-medium">
                            {pendingCount} transações pendentes {source ? 'deste cartão' : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard
                    title="Total Gasto"
                    value={formatCurrency(stats.totalGasto)}
                    icon={<TrendingDown className="w-5 h-5 text-danger" />}
                    variant="danger"
                />
                <StatCard
                    title="Parcelamentos"
                    value={formatCurrency(stats.installmentsTotal)}
                    icon={<CreditCard className="w-5 h-5 text-indigo-500" />}
                    onClick={() => setShowInstallmentsModal(true)}
                    className="cursor-pointer hover:border-indigo-500/50 transition-colors"
                />
                {stats.maxCategory && (
                    <StatCard
                        title="Maior Categoria"
                        value={formatCurrency(stats.maxCategory.value)}
                        subtitle={stats.maxCategory.name}
                        icon={<PieChartIcon className="w-5 h-5 text-primary-500" />}
                    />
                )}
                {stats.maxSubcategory && (
                    <StatCard
                        title="Maior Subcategoria"
                        value={formatCurrency(stats.maxSubcategory.value)}
                        subtitle={stats.maxSubcategory.name}
                        icon={<Tags className="w-5 h-5 text-emerald-500" />}
                    />
                )}
                {stats.maxTransaction && (
                    <StatCard
                        title="Maior Lançamento"
                        value={formatCurrency(stats.maxTransaction.value)}
                        subtitle={`${stats.maxTransaction.name} • ${stats.maxTransaction.date.toLocaleDateString('pt-BR')}`}
                        icon={<ShoppingBag className="w-5 h-5 text-rose-500" />}
                    />
                )}
                {stats.topMerchant && (
                    <StatCard
                        title="Lugar Mais Frequente"
                        value={`${stats.topMerchant.count}x`}
                        subtitle={stats.topMerchant.name}
                        icon={<MapPin className="w-5 h-5 text-amber-500" />}
                    />
                )}
            </div>

            {/* Credit Cards Section - Only show when NOT filtered by source */}
            {!source && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Nubank Card */}
                    <div className="card p-5 border-l-4 border-l-[#8A05BE] hover:scale-[1.02] transition-transform">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-[#8A05BE]/20 flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-[#8A05BE]" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-text-primary">Nubank</h3>
                                <p className="text-xs text-text-muted">Cartão de Crédito</p>
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-[#8A05BE]">
                            {formatCurrency(stats.nubankTotal)}
                        </div>
                        <p className="text-xs text-text-muted mt-1">{stats.nubankCount} transações</p>
                    </div>

                    {/* XP Card */}
                    <div className="card p-5 border-l-4 border-l-[#FFCC00] hover:scale-[1.02] transition-transform">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-[#FFCC00]/20 flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-[#FFCC00]" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-text-primary">XP</h3>
                                <p className="text-xs text-text-muted">Cartão de Crédito</p>
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-[#FFCC00]">
                            {formatCurrency(stats.xpTotal)}
                        </div>
                        <p className="text-xs text-text-muted mt-1">{stats.xpCount} transações</p>
                    </div>

                    {/* Combined Card */}
                    <div className="card p-5 border-l-4 border-l-primary-500 hover:scale-[1.02] transition-transform bg-gradient-to-br from-surface-800 to-surface-700">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-primary-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-text-primary">Total Cartões</h3>
                                <p className="text-xs text-text-muted">Nubank + XP</p>
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-primary-400">
                            {formatCurrency(stats.nubankTotal + stats.xpTotal)}
                        </div>
                        <p className="text-xs text-text-muted mt-1">{stats.nubankCount + stats.xpCount} transações</p>
                    </div>
                </div>
            )}

            {/* Daily Evolution Chart - New Feature */}
            <div className="card p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                    Gastos Diários ({getMonthName(selectedMonth)})
                </h3>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                            <XAxis
                                dataKey="day"
                                stroke="#6b7280"
                                tick={{ fill: '#374151', fontSize: 12 }}
                                tickCount={10}
                            />
                            <YAxis
                                tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`}
                                stroke="#6b7280"
                                tick={{ fill: '#374151', fontSize: 12 }}
                            />
                            <Tooltip
                                formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                                labelFormatter={(label) => `Dia ${label}`}
                                contentStyle={TOOLTIP_STYLE}
                            />
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                name="Gastos do Dia"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Pie Chart */}
                <div className="card p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                        Gastos por Categoria
                    </h3>
                    {categoryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {categoryData.map((_, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                                    contentStyle={TOOLTIP_STYLE}
                                />
                                <Legend
                                    layout="vertical"
                                    verticalAlign="middle"
                                    align="right"
                                    wrapperStyle={{ fontSize: '12px', color: '#374151' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-text-muted">
                            Nenhuma transação neste mês
                        </div>
                    )}
                </div>

                {/* 6-Month Evolution */}
                <div className="card p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                        Evolução (6 meses)
                    </h3>
                    {evolutionData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={evolutionData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="month"
                                    stroke="#6b7280"
                                    tick={{ fill: '#374151' }}
                                />
                                <YAxis
                                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                                    stroke="#6b7280"
                                    tick={{ fill: '#374151' }}
                                />
                                <Tooltip
                                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                                    contentStyle={TOOLTIP_STYLE}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="gastos"
                                    stroke="#dc2626"
                                    strokeWidth={3}
                                    dot={{ fill: '#dc2626', strokeWidth: 2 }}
                                    name="Gastos"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="receitas"
                                    stroke="#16a34a"
                                    strokeWidth={3}
                                    dot={{ fill: '#16a34a', strokeWidth: 2 }}
                                    name="Receitas"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-text-muted">
                            Sem dados para exibir
                        </div>
                    )}
                </div>
            </div>

            {/* Top Expenses Bar Chart */}
            <div className="card p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                    Maiores Gastos por Categoria
                </h3>
                {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart
                            data={categoryData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                            <XAxis
                                type="number"
                                tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`}
                                stroke="#6b7280"
                                tick={{ fill: '#374151', fontSize: 12 }}
                            />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={100}
                                stroke="#6b7280"
                                tick={{ fill: '#374151', fontSize: 12 }}
                                tickFormatter={(val) => val.length > 12 ? `${val.substring(0, 12)}...` : val}
                            />
                            <Tooltip
                                formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                                contentStyle={TOOLTIP_STYLE}
                                cursor={{ fill: 'transparent' }}
                            />
                            <Bar
                                dataKey="value"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={(data: any) => {
                                    if (data && data.originalKey) {
                                        setDrilldownFilter({
                                            type: 'MACRO',
                                            key: data.originalKey,
                                            name: data.name
                                        });
                                    }
                                }}
                            >
                                {categoryData.map((_, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-[250px] text-text-muted">
                        Nenhuma transação neste mês
                    </div>
                )}
            </div>

            {/* Top Subcategories Bar Chart */}
            {subcategoryData.length > 0 && (
                <div className="card p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-6">
                        Detalhamento por Subcategoria
                    </h3>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                            data={subcategoryData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                            <XAxis
                                type="number"
                                tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`}
                                stroke="#6b7280"
                                tick={{ fill: '#374151', fontSize: 13, fontWeight: 500 }}
                            />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={160}
                                stroke="#6b7280"
                                tick={{ fill: '#374151', fontSize: 13, fontWeight: 500 }}
                                tickFormatter={(val) => val.length > 20 ? `${val.substring(0, 20)}...` : val}
                            />
                            <Tooltip
                                formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                                contentStyle={TOOLTIP_STYLE}
                                cursor={{ fill: 'transparent' }}
                            />
                            <Bar
                                dataKey="value"
                                radius={[0, 6, 6, 0]}
                                barSize={32}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={(data: any) => {
                                    if (data && data.originalKey) {
                                        setDrilldownFilter({
                                            type: 'SUB',
                                            key: data.originalKey,
                                            name: data.name
                                        });
                                    }
                                }}
                            >
                                {subcategoryData.map((_, index) => (
                                    <Cell
                                        key={`subcell-${index}`}
                                        fill={[
                                            '#4c1d95', // violet-900
                                            '#5b21b6', // violet-800
                                            '#6d28d9', // violet-700
                                            '#7c3aed', // violet-600
                                            '#8b5cf6', // violet-500
                                            '#a78bfa', // violet-400
                                            '#c4b5fd', // violet-300
                                            '#ddd6fe', // violet-200
                                            '#ede9fe', // violet-100
                                            '#f5f3ff', // violet-50
                                        ][index % 10]}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )
            }
            {/* Transaction List Table - Only if Source is selected (Detailed View) */}
            {
                source && monthTransactions && monthTransactions.length > 0 && (
                    <div className="card overflow-hidden">
                        <div className="p-6 border-b border-surface-200">
                            <h3 className="text-lg font-semibold text-text-primary">
                                Extrato Detalhado ({source})
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-surface-100 text-text-secondary font-medium">
                                    <tr>
                                        <th className="px-4 py-3">Data</th>
                                        <th className="px-4 py-3">Descrição</th>
                                        <th className="px-4 py-3">Categoria</th>
                                        <th className="px-4 py-3">Subcategoria</th>
                                        <th className="px-4 py-3">Obs</th>
                                        <th className="px-4 py-3 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-200">
                                    {monthTransactions
                                        .sort((a, b) => b.dataEvento.getTime() - a.dataEvento.getTime())
                                        .map((t) => (
                                            <tr key={t.id} className="hover:bg-surface-50 transition-colors cursor-pointer" onClick={() => {
                                                setManualSelection(t);
                                                setShowCategoryModal(true);
                                            }}>
                                                <td className="px-4 py-3 text-text-secondary whitespace-nowrap text-xs">
                                                    {t.dataEvento.toLocaleDateString('pt-BR')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-text-primary">
                                                        {t.descricaoOriginal}
                                                        {t.parcelado && (
                                                            <span className="ml-2 text-xs text-text-muted bg-surface-200 px-1.5 py-0.5 rounded">
                                                                {t.parcelaNum}/{t.parcelaTotal}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className="inline-block px-2 py-1 rounded text-xs font-medium"
                                                        style={{
                                                            backgroundColor: `${getCategoryColor(t.categoriaMacro)}20`,
                                                            color: getCategoryColor(t.categoriaMacro)
                                                        }}
                                                    >
                                                        {formatCategoryName(t.categoriaMacro || 'Não Classificado')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs">
                                                    {t.categoriaSub ? (
                                                        <span className="text-text-secondary">{formatCategoryName(t.categoriaSub)}</span>
                                                    ) : ['compras', 'alimentacao_lazer', 'outros', 'nao_classificado'].includes(t.categoriaMacro || '') ? (
                                                        <span className="text-amber-500 flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                            Especificar
                                                        </span>
                                                    ) : (
                                                        <span className="text-text-muted">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-text-muted text-xs max-w-[150px] truncate" title={t.observacao || ''}>
                                                    {t.observacao || '-'}
                                                </td>
                                                <td className={cn(
                                                    "px-4 py-3 text-right font-medium whitespace-nowrap",
                                                    t.tipo === 'DEBITO' ? 'text-danger' : 'text-success'
                                                )}>
                                                    {t.tipo === 'DEBITO' ? '-' : '+'} {formatCurrency(t.valor)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {
                showCategoryModal && (
                    <QuickCategoryModal
                        isOpen={showCategoryModal}
                        onClose={() => {
                            setShowCategoryModal(false);
                            setManualSelection(null);
                        }}
                        transaction={activeTransaction}
                        onSave={handleCategorize}
                    />
                )
            }

            <InstallmentsModal
                isOpen={showInstallmentsModal}
                onClose={() => setShowInstallmentsModal(false)}
            />

            <DrilldownModal
                isOpen={!!drilldownFilter}
                onClose={() => setDrilldownFilter(null)}
                title={drilldownFilter ? `Detalhamento: ${drilldownFilter.name}` : ''}
                transactions={drilldownTransactions}
                onTransactionClick={(t) => {
                    setManualSelection(t);
                    setShowCategoryModal(true);
                }}
            />
        </div >
    );
}

// ============== HELPER FUNCTIONS ==============

function calculateStats(transactions: Transaction[]) {
    // Exclude Neutral Categories "Repasse", "Interno" and "Pagamento de Cartão" from totals
    const ignoredCategories = ['repasse', 'interno', 'pagamento_cartao'];

    const gastos = transactions.filter((t) =>
        t.tipo === 'DEBITO' && !ignoredCategories.includes(t.categoriaMacro || '')
    );
    const receitas = transactions.filter((t) =>
        t.tipo === 'CREDITO' && !ignoredCategories.includes(t.categoriaMacro || '')
    );

    // Total gasto considera valores negativos (créditos/abatimentos)
    const totalGasto = gastos.reduce((sum, t) => sum + Math.abs(t.valor), 0);
    const totalRecebido = receitas.reduce((sum, t) => sum + Math.abs(t.valor), 0);

    // Breakdown by card
    const nubankTx = transactions.filter(t => t.origem === 'NUBANK' && t.tipo === 'DEBITO');
    const xpTx = transactions.filter(t => t.origem === 'XP' && t.tipo === 'DEBITO');

    // 1. Max Category
    const catMap: Record<string, number> = {};
    gastos.forEach(t => {
        const cat = t.categoriaMacro || 'Outros';
        catMap[cat] = (catMap[cat] || 0) + t.valor;
    });
    const maxCategoryEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    const maxCategory = maxCategoryEntry ? { name: formatCategoryName(maxCategoryEntry[0]), value: maxCategoryEntry[1] } : null;

    // 2. Max Subcategory
    const subMap: Record<string, number> = {};
    gastos.forEach(t => {
        if (t.categoriaSub) {
            subMap[t.categoriaSub] = (subMap[t.categoriaSub] || 0) + t.valor;
        }
    });
    const maxSubEntry = Object.entries(subMap).sort((a, b) => b[1] - a[1])[0];
    const maxSubcategory = maxSubEntry ? { name: formatCategoryName(maxSubEntry[0]), value: maxSubEntry[1] } : null;

    // 3. Max Single Transaction
    const maxTx = [...gastos].sort((a, b) => b.valor - a.valor)[0];
    const maxTransaction = maxTx ? { name: maxTx.descricaoOriginal, value: maxTx.valor, date: maxTx.dataEvento } : null;

    // 4. Top Merchant (Frequent Place)
    // Heuristic: Use first 15 chars normalized to group
    const merchMap: Record<string, { count: number, name: string }> = {};
    gastos.forEach(t => {
        const key = t.descricaoOriginal.substring(0, 15).toUpperCase();
        if (!merchMap[key]) {
            merchMap[key] = { count: 0, name: t.descricaoOriginal }; // Keep first name seen as display
        }
        merchMap[key].count++;
    });
    const topMerchEntry = Object.values(merchMap).sort((a, b) => b.count - a.count)[0];
    const topMerchant = topMerchEntry ? { name: topMerchEntry.name, count: topMerchEntry.count } : null;

    return {
        totalGasto,
        totalRecebido,
        saldo: totalRecebido - totalGasto,
        nubankTotal: nubankTx.reduce((sum, t) => sum + t.valor, 0),
        nubankCount: nubankTx.length,
        xpTotal: xpTx.reduce((sum, t) => sum + t.valor, 0),
        xpCount: xpTx.length,
        installmentsTotal: transactions.filter(t => t.parcelado && t.tipo === 'DEBITO').reduce((sum, t) => sum + t.valor, 0),
        maxCategory,
        maxSubcategory,
        maxTransaction,
        topMerchant
    };
}

function getCategoryData(transactions: Transaction[]) {
    const gastos = transactions.filter((t) => t.tipo === 'DEBITO');
    const byCategory: Record<string, number> = {};

    for (const t of gastos) {
        const cat = t.categoriaMacro || 'Sem categoria';
        byCategory[cat] = (byCategory[cat] || 0) + t.valor;
    }

    return Object.entries(byCategory)
        .map(([key, value]) => ({
            name: formatCategoryName(key),
            value,
            // Keep original key if needed for colors or other logic, but usually index is fine
            originalKey: key
        }))
        .filter(item => item.value > 0) // Only show positive expenses in the breakdown
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
}

function getSubcategoryData(transactions: Transaction[]) {
    const gastos = transactions.filter((t) => t.tipo === 'DEBITO' && t.categoriaSub);
    const bySubcategory: Record<string, number> = {};

    for (const t of gastos) {
        const sub = t.categoriaSub!;
        bySubcategory[sub] = (bySubcategory[sub] || 0) + t.valor;
    }

    return Object.entries(bySubcategory)
        .map(([key, value]) => ({
            name: formatCategoryName(key),
            value,
            originalKey: key
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
}

function getEvolutionData(transactions: Transaction[], months: string[]) {
    const data = months.map((m) => {
        const monthTx = transactions.filter((t) => t.mesCompetencia === m);
        const gastos = monthTx.filter((t) => t.tipo === 'DEBITO').reduce((s, t) => s + t.valor, 0);
        const receitas = monthTx.filter((t) => t.tipo === 'CREDITO').reduce((s, t) => s + t.valor, 0);

        // Get short month name
        const [year, month] = m.split('-').map(Number);
        const date = new Date(year, month - 1);
        const monthName = date.toLocaleDateString('pt-BR', { month: 'short' });

        return { month: monthName, gastos, receitas };
    });

    return data;
}

function getDailyData(transactions: Transaction[], yearMonth: string) {
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    // Initialize all days with 0
    const days = Array.from({ length: daysInMonth }, (_, i) => {
        return { day: i + 1, value: 0 };
    });

    const gastos = transactions.filter(t => t.tipo === 'DEBITO');

    for (const t of gastos) {
        if (t.dataEvento) {
            const day = t.dataEvento.getDate();
            if (day >= 1 && day <= daysInMonth) {
                days[day - 1].value += t.valor;
            }
        }
    }

    return days;
}
