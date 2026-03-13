import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { Transaction } from '../db/schema';
import { useUIStore } from '../store/uiStore';
import { formatCurrency, getMonthName, getLastNMonths, getReviewCandidates } from '../lib/utils';
import { TrendingUp, TrendingDown, Wallet, CreditCard, DollarSign, ChevronDown, ChevronUp, Sparkles, X, ArrowRight } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ReviewWizardModal } from '../components/ReviewWizardModal';
// Removed Button import from ui/button as it doesn't exist


const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
// Tooltip style for light theme
const TOOLTIP_STYLE = {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    color: '#1f2937',
};

export function MainDashboard() {
    const selectedMonth = useUIStore((s) => s.selectedMonth);
    const last6Months = getLastNMonths(6).reverse();
    const [expandedSource, setExpandedSource] = useState<'CARDS' | 'BANK' | 'INCOME' | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [showReviewInvite, setShowReviewInvite] = useState(true);

    // 1. Get transactions for selected month (for KPIs and breakdowns)
    const transactions = useLiveQuery(() => {
        let query = db.transactions.where('statusRevisao').equals('OK');

        if (selectedMonth !== 'ALL') {
            query = query.filter(t => t.mesCompetencia === selectedMonth);
        }

        return query.toArray();
    }, [selectedMonth]) || [];

    // 2. Get transactions for last 6 months (for Evolution Chart)
    const sixMonthTransactions = useLiveQuery(
        () =>
            db.transactions
                .where('statusRevisao').equals('OK')
                .filter(t => last6Months.includes(t.mesCompetencia))
                .toArray(),
        [last6Months.join(',')]
    ) || [];

    // 3. Get Review Candidates (Global, not just selected month)
    const reviewCandidates = useLiveQuery(async () => {
        const allTxs = await db.transactions.where('statusRevisao').equals('OK').toArray();
        const candidates = getReviewCandidates(allTxs);
        // Take top 5
        return candidates.slice(0, 5);
    }, []) || [];


    // --- FILTERS ---
    const ignoredCategories = ['repasse', 'interno'];
    const creditCardPaymentCategory = 'pagamento_cartao';

    // Helper to calculate totals for a set of transactions
    const calculateAggregates = (txs: Transaction[]) => {
        const incomeTxs = txs.filter(t =>
            t.origem === 'ITAU' &&
            t.tipo === 'CREDITO' &&
            !ignoredCategories.includes(t.categoriaMacro || '')
        );
        const income = incomeTxs.reduce((acc, t) => acc + t.valor, 0);

        const cardExpensesTxs = txs.filter(t =>
            ['NUBANK', 'XP'].includes(t.origem) &&
            t.tipo === 'DEBITO' &&
            !ignoredCategories.includes(t.categoriaMacro || '')
        );
        const cardExpenses = cardExpensesTxs.reduce((acc, t) => acc + Math.abs(t.valor), 0);

        const bankDebitsTxs = txs.filter(t =>
            t.origem === 'ITAU' &&
            t.tipo === 'DEBITO' &&
            !ignoredCategories.includes(t.categoriaMacro || '') &&
            t.categoriaMacro !== creditCardPaymentCategory
        );
        const bankDebits = bankDebitsTxs.reduce((acc, t) => acc + Math.abs(t.valor), 0);

        return {
            income,
            expenses: cardExpenses + bankDebits,
            cardExpenses,
            bankDebits,
            cardExpensesTxs,
            bankDebitsTxs,
            incomeTxs
        };
    };

    // Calculate Current Month Stats
    const currentStats = calculateAggregates(transactions);
    const netResult = currentStats.income - currentStats.expenses;

    // Get Top 5 for Dropdowns
    const getTop5 = (txs: Transaction[]) => {
        return [...txs]
            .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
            .slice(0, 5);
    };

    const top5Cards = getTop5(currentStats.cardExpensesTxs || []);
    const top5Bank = getTop5(currentStats.bankDebitsTxs || []);
    const top5Income = getTop5(currentStats.incomeTxs || []);

    const toggleExpand = (source: 'CARDS' | 'BANK' | 'INCOME') => {
        if (expandedSource === source) {
            setExpandedSource(null);
        } else {
            setExpandedSource(source);
        }
    };

    // Calculate Evolution Data
    const evolutionData = last6Months.map(month => {
        const monthTxs = sixMonthTransactions.filter(t => t.mesCompetencia === month);
        const stats = calculateAggregates(monthTxs);
        return {
            month: getMonthName(month).substring(0, 3), // Short month name
            fullMonth: month,
            receitas: stats.income,
            gastos: stats.expenses
        };
    });


    // Aggregated Transactions for Category Chart
    const expenseByCategory: Record<string, number> = {};
    const relevantExpenses = transactions.filter(t => {
        // Must be expense
        if (t.tipo !== 'DEBITO') return false;
        // Must accept origin
        if (!['NUBANK', 'XP', 'ITAU'].includes(t.origem)) return false;
        // Filter ignored
        if (ignoredCategories.includes(t.categoriaMacro || '')) return false;
        // Filter card payment if ITAU (to avoid double count)
        if (t.origem === 'ITAU' && t.categoriaMacro === creditCardPaymentCategory) return false;
        return true;
    });

    relevantExpenses.forEach(t => {
        const cat = t.categoriaMacro || 'Outros';
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Math.abs(t.valor);
    });

    const pieData = Object.entries(expenseByCategory)
        .map(([name, value]) => ({ name: name.replace('_', ' '), value }))
        .sort((a, b) => b.value - a.value);

    return (
        <div className="p-6 space-y-6 animate-fade-in relative">
            <ReviewWizardModal
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                candidates={reviewCandidates}
            />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                        Visão Geral - {selectedMonth === 'ALL' ? 'Todo o Período' : getMonthName(selectedMonth)}
                    </h1>
                    <p className="text-text-secondary">Consolidado de Receitas e Despesas</p>
                </div>
            </div>

            {/* Review Invitation Card - Only Shows if Candidates Exist */}
            {reviewCandidates.length > 0 && showReviewInvite && (
                <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-slide-down">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-full">
                            <Sparkles className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-text-primary">Revisão Pendente</h3>
                            <p className="text-sm text-text-muted">
                                Encontramos <strong>{reviewCandidates.length} lançamentos</strong> que precisam da sua atenção.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                            className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center transition-colors shadow-sm"
                            onClick={() => setIsReviewModalOpen(true)}
                        >
                            Revisar Agora <ArrowRight className="w-4 h-4 ml-2" />
                        </button>
                        <button
                            className="text-text-muted hover:text-text-primary hover:bg-white/10 p-2 rounded-lg transition-colors"
                            onClick={() => setShowReviewInvite(false)}
                            title="Fechar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    title="Receitas Totais"
                    value={formatCurrency(currentStats.income)}
                    icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
                />
                <StatCard
                    title="Despesas Totais"
                    value={formatCurrency(currentStats.expenses)}
                    icon={<TrendingDown className="w-5 h-5 text-rose-500" />}
                />
                <StatCard
                    title="Saldo do Período"
                    value={formatCurrency(netResult)}
                    icon={<Wallet className="w-5 h-5 text-blue-500" />}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LEFT COLUMN: Breakdown + Evolution */}
                <div className="space-y-6">

                    {/* Breakdown by Income Sources */}
                    <div className="bg-surface-800 p-6 rounded-2xl border border-surface-700 shadow-sm">
                        <h3 className="text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-500" />
                            Composição das Receitas
                        </h3>
                        <div className="space-y-4">
                            {/* Income Source Row */}
                            <div className="rounded-xl overflow-hidden bg-surface-700/30 transition-all">
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-700/50"
                                    onClick={() => toggleExpand('INCOME')}
                                >
                                    <div className="flex items-center gap-3">
                                        <Wallet className="w-5 h-5 text-emerald-400" />
                                        <span className="text-text-primary font-medium">Conta (Itaú - Crédito)</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-text-primary font-bold">{formatCurrency(currentStats.income)}</span>
                                        {expandedSource === 'INCOME' ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                                    </div>
                                </div>
                                {/* Dropdown Content */}
                                {expandedSource === 'INCOME' && (
                                    <div className="px-4 pb-4 border-t border-surface-600/50 animate-slide-down">
                                        <p className="text-xs font-semibold text-text-muted mt-3 mb-2 uppercase tracking-wide">Top 5 Entradas</p>
                                        <div className="space-y-2">
                                            {top5Income.map(t => (
                                                <div key={t.id} className="flex justify-between items-center text-sm">
                                                    <div className="flex flex-col">
                                                        <span className="text-text-primary truncate max-w-[200px]">{t.descricaoOriginal}</span>
                                                        <span className="text-xs text-text-muted">{t.dataEvento.toLocaleDateString('pt-BR')}</span>
                                                    </div>
                                                    <span className="font-medium text-text-primary">{formatCurrency(Math.abs(t.valor))}</span>
                                                </div>
                                            ))}
                                            {top5Income.length === 0 && <p className="text-sm text-text-muted italic">Nenhuma receita encontrada.</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Breakdown by Expense Sources */}
                    <div className="bg-surface-800 p-6 rounded-2xl border border-surface-700 shadow-sm">
                        <h3 className="text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-primary-400" />
                            Composição das Despesas
                        </h3>
                        <div className="space-y-4">

                            {/* Card Source Row */}
                            <div className="rounded-xl overflow-hidden bg-surface-700/30 transition-all">
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-700/50"
                                    onClick={() => toggleExpand('CARDS')}
                                >
                                    <div className="flex items-center gap-3">
                                        <CreditCard className="w-5 h-5 text-purple-400" />
                                        <span className="text-text-primary font-medium">Cartões (Nu + XP)</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-text-primary font-bold">{formatCurrency(currentStats.cardExpenses)}</span>
                                        {expandedSource === 'CARDS' ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                                    </div>
                                </div>
                                {/* Dropdown Content */}
                                {expandedSource === 'CARDS' && (
                                    <div className="px-4 pb-4 border-t border-surface-600/50 animate-slide-down">
                                        <p className="text-xs font-semibold text-text-muted mt-3 mb-2 uppercase tracking-wide">Top 5 Gastos</p>
                                        <div className="space-y-2">
                                            {top5Cards.map(t => (
                                                <div key={t.id} className="flex justify-between items-center text-sm">
                                                    <div className="flex flex-col">
                                                        <span className="text-text-primary truncate max-w-[200px]">{t.descricaoOriginal}</span>
                                                        <span className="text-xs text-text-muted">{t.dataEvento.toLocaleDateString('pt-BR')} • {t.origem}</span>
                                                    </div>
                                                    <span className="font-medium text-text-primary">{formatCurrency(Math.abs(t.valor))}</span>
                                                </div>
                                            ))}
                                            {top5Cards.length === 0 && <p className="text-sm text-text-muted italic">Nenhum gasto encontrado.</p>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bank Source Row */}
                            <div className="rounded-xl overflow-hidden bg-surface-700/30 transition-all">
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-700/50"
                                    onClick={() => toggleExpand('BANK')}
                                >
                                    <div className="flex items-center gap-3">
                                        <Wallet className="w-5 h-5 text-orange-400" />
                                        <span className="text-text-primary font-medium">Conta (Itaú - Débito)</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-text-primary font-bold">{formatCurrency(currentStats.bankDebits)}</span>
                                        {expandedSource === 'BANK' ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                                    </div>
                                </div>
                                {/* Dropdown Content */}
                                {expandedSource === 'BANK' && (
                                    <div className="px-4 pb-4 border-t border-surface-600/50 animate-slide-down">
                                        <p className="text-xs font-semibold text-text-muted mt-3 mb-2 uppercase tracking-wide">Top 5 Gastos</p>
                                        <div className="space-y-2">
                                            {top5Bank.map(t => (
                                                <div key={t.id} className="flex justify-between items-center text-sm">
                                                    <div className="flex flex-col">
                                                        <span className="text-text-primary truncate max-w-[200px]">{t.descricaoOriginal}</span>
                                                        <span className="text-xs text-text-muted">{t.dataEvento.toLocaleDateString('pt-BR')}</span>
                                                    </div>
                                                    <span className="font-medium text-text-primary">{formatCurrency(Math.abs(t.valor))}</span>
                                                </div>
                                            ))}
                                            {top5Bank.length === 0 && <p className="text-sm text-text-muted italic">Nenhum gasto encontrado.</p>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-surface-700 flex justify-between items-center">
                                <span className="text-text-secondary">Total</span>
                                <span className="text-xl font-bold text-rose-400">{formatCurrency(currentStats.expenses)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Evolution Chart (Moved Here) */}
                    <div className="card p-6 bg-surface-800 rounded-2xl border border-surface-700 shadow-sm">
                        <h3 className="text-lg font-semibold text-text-primary mb-4">
                            Evolução (6 meses)
                        </h3>
                        {evolutionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={evolutionData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} opacity={0.5} />
                                    <XAxis
                                        dataKey="month"
                                        stroke="#9ca3af"
                                        tick={{ fill: '#9ca3af' }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                                        stroke="#9ca3af"
                                        tick={{ fill: '#9ca3af' }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        formatter={(value: any) => formatCurrency(Number(value))}
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={{ stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="gastos"
                                        stroke="#dc2626"
                                        strokeWidth={3}
                                        dot={{ fill: '#dc2626', strokeWidth: 2, r: 4 }}
                                        activeDot={{ r: 6 }}
                                        name="Despesas"
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="receitas"
                                        stroke="#10b981"
                                        strokeWidth={3}
                                        dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                                        activeDot={{ r: 6 }}
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

                {/* RIGHT COLUMN: Category Pie Chart */}
                <div className="bg-surface-800 p-6 rounded-2xl border border-surface-700 shadow-sm flex flex-col">
                    <h3 className="text-lg font-semibold text-text-primary mb-6">Despesas por Categoria</h3>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {pieData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: any) => formatCurrency(Number(value))}
                                    contentStyle={TOOLTIP_STYLE}
                                    itemStyle={{ color: '#374151' }}
                                />
                                <Legend
                                    layout="vertical"
                                    verticalAlign="middle"
                                    align="right"
                                    wrapperStyle={{ fontSize: '13px', color: '#9ca3af' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
