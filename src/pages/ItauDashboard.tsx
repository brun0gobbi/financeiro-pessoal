import { FileText, TrendingUp, TrendingDown, Wallet, PieChart as PieIcon, ArrowUpRight } from 'lucide-react';
// Remove direct extract transactions, rely on DB
import { db } from '../db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { StatCard } from '../components/StatCard';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { formatCurrency, formatCategoryName, getMonthName } from '../lib/utils';
import { CATEGORY_COLORS } from './Dashboard';
import { useUIStore } from '../store/uiStore';

const COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5']; // Shades of Emerald for Income

export function ItauDashboard() {
    const selectedMonth = useUIStore((s) => s.selectedMonth);

    // Get approved Itaú transactions for the selected month
    const transactions = useLiveQuery(
        () => {
            let query = db.transactions
                .where('origem').equals('ITAU')
                .filter(t => t.statusRevisao === 'OK');

            if (selectedMonth !== 'ALL') {
                query = query.and(t => t.mesCompetencia === selectedMonth);
            }

            return query.reverse().sortBy('dataEvento');
        },
        [selectedMonth]
    ) || [];

    const ignoredCategories = ['repasse', 'interno'];

    const incomeTransactions = transactions.filter(t =>
        t.tipo === 'CREDITO' && !ignoredCategories.includes(t.categoriaMacro || '')
    );
    const expenseTransactions = transactions.filter(t =>
        t.tipo === 'DEBITO' && !ignoredCategories.includes(t.categoriaMacro || '')
    );

    const totalIncome = incomeTransactions.reduce((acc, t) => acc + t.valor, 0);
    const totalExpenses = expenseTransactions.reduce((acc, t) => acc + t.valor, 0);
    const netFlow = totalIncome + totalExpenses;

    // Income by Subcategory
    const incomeBySub: Record<string, number> = {};
    incomeTransactions.forEach(t => {
        const sub = t.categoriaSub || 'Outros';
        incomeBySub[sub] = (incomeBySub[sub] || 0) + t.valor;
    });

    const incomeData = Object.entries(incomeBySub)
        .map(([key, value]) => ({ name: formatCategoryName(key), value }))
        .sort((a, b) => b.value - a.value);

    return (
        <div className="p-6 space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-orange-400 bg-clip-text text-transparent">
                        Itaú - Conta Corrente - {getMonthName(selectedMonth)}
                    </h1>
                    <p className="text-text-secondary">Visão detalhada de fluxo de caixa</p>
                </div>
            </div>

            {transactions.length > 0 ? (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard
                            title="Entradas (Créditos)"
                            value={formatCurrency(totalIncome)}
                            icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
                            className="border-l-4 border-l-emerald-500"
                        />
                        <StatCard
                            title="Saídas (Débitos)"
                            value={formatCurrency(totalExpenses)}
                            icon={<TrendingDown className="w-5 h-5 text-red-500" />}
                            className="border-l-4 border-l-red-500"
                        />
                        <StatCard
                            title="Fluxo Líquido"
                            value={formatCurrency(netFlow)}
                            icon={<Wallet className="w-5 h-5 text-orange-500" />}
                            className={`border-l-4 ${netFlow >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}
                        />
                    </div>

                    {/* Income Analysis Section */}
                    {incomeData.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="card p-6">
                                <div className="flex items-center gap-2 mb-6">
                                    <PieIcon className="w-5 h-5 text-emerald-500" />
                                    <h3 className="text-lg font-semibold text-text-primary">Fontes de Receita</h3>
                                </div>
                                <div className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={incomeData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={2}
                                                dataKey="value"
                                            >
                                                {incomeData.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value: any) => formatCurrency(Number(value))}
                                                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                                            />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="card p-6">
                                <div className="flex items-center gap-2 mb-6">
                                    <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                                    <h3 className="text-lg font-semibold text-text-primary">Ranking de Receitas</h3>
                                </div>
                                <div className="space-y-4">
                                    {incomeData.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-surface-50 dark:bg-surface-800 rounded-xl hover:bg-surface-100 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                                                    {idx + 1}
                                                </div>
                                                <span className="font-medium text-text-primary">{item.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-emerald-600 dark:text-emerald-400">
                                                    {formatCurrency(item.value)}
                                                </div>
                                                <div className="text-xs text-text-muted">
                                                    {((item.value / totalIncome) * 100).toFixed(1)}%
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Expense Analysis Section */}
                    {expenseTransactions.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="card p-6">
                                <div className="flex items-center gap-2 mb-6">
                                    <PieIcon className="w-5 h-5 text-red-500" />
                                    <h3 className="text-lg font-semibold text-text-primary">Gastos por Categoria</h3>
                                </div>
                                <div className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={Object.entries(expenseTransactions.reduce<Record<string, number>>((acc, t) => {
                                                    const cat = t.categoriaMacro || 'Outros';
                                                    acc[cat] = (acc[cat] || 0) + Math.abs(t.valor);
                                                    return acc;
                                                }, {}))
                                                    .map(([key, value]) => ({ name: formatCategoryName(key), value }))
                                                    .sort((a, b) => b.value - a.value)}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={2}
                                                dataKey="value"
                                            >
                                                {Object.keys(expenseTransactions.reduce<Record<string, number>>((acc, t) => {
                                                    const cat = t.categoriaMacro || 'Outros';
                                                    acc[cat] = (acc[cat] || 0) + Math.abs(t.valor);
                                                    return acc;
                                                }, {})).map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value: any) => formatCurrency(Number(value))}
                                                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                                            />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="card p-6">
                                <div className="flex items-center gap-2 mb-6">
                                    <TrendingDown className="w-5 h-5 text-red-500" />
                                    <h3 className="text-lg font-semibold text-text-primary">Maiores Gastos</h3>
                                </div>
                                <div className="space-y-4">
                                    {expenseTransactions
                                        .sort((a, b) => a.valor - b.valor) // Sort ascending to get most negative first (e.g. -100 before -10)
                                        .slice(0, 5) // Top 5 expenses
                                        .map((t, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 bg-surface-50 dark:bg-surface-800 rounded-xl hover:bg-surface-100 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 font-bold text-sm">
                                                        {idx + 1}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-text-primary block">{t.descricaoOriginal}</span>
                                                        <span className="text-xs text-text-muted">{formatCategoryName(t.categoriaMacro || '')}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-red-600 dark:text-red-400">
                                                        {formatCurrency(t.valor)}
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {t.dataEvento.toLocaleDateString('pt-BR').slice(0, 5)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Detailed List */}
                    <div className="card overflow-hidden">
                        <div className="p-6 border-b border-surface-200 dark:border-surface-700 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-orange-500" />
                            <h2 className="font-semibold text-text-primary">Extrato Completo</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-surface-100 dark:bg-surface-800 text-text-secondary font-medium">
                                    <tr>
                                        <th className="px-4 py-3">Data</th>
                                        <th className="px-4 py-3">Descrição</th>
                                        <th className="px-4 py-3">Categoria</th>
                                        <th className="px-4 py-3 text-right">Valor</th>
                                        <th className="px-4 py-3 text-center">Tipo</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-200 dark:divide-surface-700">
                                    {transactions.map((t) => (
                                        <tr key={t.id} className="hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors">
                                            <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                                                {t.dataEvento.toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-text-primary">{t.descricaoOriginal}</div>
                                                {t.observacao && <div className="text-xs text-text-muted">{t.observacao}</div>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-surface-200 text-text-secondary">
                                                    {formatCategoryName(t.categoriaSub || t.categoriaMacro || '-')}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-3 text-right font-medium ${t.tipo === 'CREDITO' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {t.tipo === 'DEBITO' ? '-' : '+'} {formatCurrency(Math.abs(t.valor))}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.tipo === 'CREDITO'
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                                                    }`}>
                                                    {t.tipo === 'CREDITO' ? 'Entrada' : 'Saída'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted bg-surface-50 dark:bg-surface-800/50 rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-700">
                    <Wallet className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-1">Nenhum lançamento encontrado</p>
                    <p className="text-sm">Importe seu extrato e aprove as pendências.</p>
                </div>
            )}
        </div>
    );
}
