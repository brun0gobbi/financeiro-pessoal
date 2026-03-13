import { useState, useEffect } from 'react';
import { db } from '../db/schema';
import type { Transaction } from '../db/schema';
import { normalizeTransactionDescription, formatCurrency, getMonthName } from '../lib/utils';
import { Search, CreditCard, Calendar, DollarSign, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface InstallmentGroup {
    originalDescription: string;
    normalizedDescription: string;
    totalValue: number;
    installmentValue: number;
    currentInstallment: number;
    totalInstallments: number;
    remainingInstallments: number;
    remainingDebt: number;
    lastPaymentDate: Date;
    endDate: Date;
    origin: string;
}

interface MonthlyProjection {
    month: string;
    label: string;
    value: number;
}

interface InstallmentsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function InstallmentsModal({ isOpen, onClose }: InstallmentsModalProps) {
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState<InstallmentGroup[]>([]);
    const [filter, setFilter] = useState('');
    const [monthlyProjection, setMonthlyProjection] = useState<MonthlyProjection[]>([]);

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        setLoading(true);
        try {
            const transactions = await db.transactions
                .filter(t => t.parcelado === true)
                .toArray();

            const groupsMap = new Map<string, Transaction[]>();

            transactions.forEach(t => {
                const norm = normalizeTransactionDescription(t.descricaoOriginal);
                // Revert to simple grouping to merge all fragments of the same plan
                const key = `${t.origem}-${norm}-${t.parcelaTotal}`;

                if (!groupsMap.has(key)) {
                    groupsMap.set(key, []);
                }
                groupsMap.get(key)!.push(t);
            });

            const activeGroups: InstallmentGroup[] = [];
            const projectionMap = new Map<string, number>();

            groupsMap.forEach((txs) => {
                // Sort by parcelaNum DESCENDING to find the "latest" status (e.g. 4/10 over 2/10)
                // This handles cases where purchase dates might be identical or out of order
                txs.sort((a, b) => (b.parcelaNum || 0) - (a.parcelaNum || 0));
                const latest = txs[0];

                if (!latest.parcelaNum || !latest.parcelaTotal) return;

                const currentNum = latest.parcelaNum;
                const totalNum = latest.parcelaTotal;

                // Show all that have remaining installments
                if (currentNum < totalNum) {
                    const remaining = totalNum - currentNum;
                    const installmentValue = Math.abs(latest.valor);
                    const remainingDebt = remaining * installmentValue;

                    const lastDate = new Date(latest.dataEvento);

                    const endDate = new Date(lastDate);
                    endDate.setMonth(endDate.getMonth() + remaining);

                    activeGroups.push({
                        originalDescription: latest.descricaoOriginal,
                        normalizedDescription: normalizeTransactionDescription(latest.descricaoOriginal),
                        totalValue: installmentValue * totalNum,
                        installmentValue: installmentValue,
                        currentInstallment: currentNum,
                        totalInstallments: totalNum,
                        remainingInstallments: remaining,
                        remainingDebt: remainingDebt,
                        lastPaymentDate: lastDate,
                        endDate: endDate,
                        origin: latest.origem
                    });

                    // Add to monthly projection
                    for (let i = 1; i <= remaining; i++) {
                        const pDate = new Date(lastDate);
                        pDate.setMonth(pDate.getMonth() + i);
                        const monthKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;

                        projectionMap.set(monthKey, (projectionMap.get(monthKey) || 0) + installmentValue);
                    }
                }
            });

            activeGroups.sort((a, b) => b.remainingDebt - a.remainingDebt);
            setGroups(activeGroups);

            const today = new Date();
            const chartData: MonthlyProjection[] = [];
            for (let i = 0; i < 12; i++) {
                const d = new Date(today);
                d.setMonth(d.getMonth() + i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

                chartData.push({
                    month: key,
                    label: i === 0 ? 'Este mês' : getMonthName(key).split(' ')[0].substring(0, 3) + '/' + key.substring(2, 4),
                    value: projectionMap.get(key) || 0
                });
            }
            setMonthlyProjection(chartData);

        } catch (err) {
            console.error("Failed to load installments", err);
        } finally {
            setLoading(false);
        }
    };

    const totalDebt = groups.reduce((acc, g) => acc + g.remainingDebt, 0);
    const avgMonthly = monthlyProjection.slice(0, 3).reduce((acc, curr) => acc + curr.value, 0) / 3;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface-50 dark:bg-surface-800 rounded-2xl w-full max-w-4xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-surface-200 dark:border-surface-700 flex justify-between items-start shrink-0 bg-white dark:bg-surface-800">
                    <div>
                        <h2 className="text-xl font-bold text-text-primary">Detalhamento de Parcelamentos</h2>
                        <p className="text-sm text-text-secondary mt-1">Dívidas futuras e projeção mensal</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors text-text-secondary">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="text-center py-12 text-text-secondary">Carregando dados...</div>
                    ) : (
                        <>
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50">
                                    <div className="flex items-center gap-3 mb-2 text-primary-600 dark:text-primary-400">
                                        <DollarSign className="w-5 h-5" />
                                        <h3 className="font-semibold text-xs uppercase tracking-wider">Dívida Total Futura</h3>
                                    </div>
                                    <p className="text-2xl font-bold text-text-primary">{formatCurrency(totalDebt)}</p>
                                </div>

                                <div className="p-5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50">
                                    <div className="flex items-center gap-3 mb-2 text-orange-500">
                                        <Calendar className="w-5 h-5" />
                                        <h3 className="font-semibold text-xs uppercase tracking-wider">Média (3 meses)</h3>
                                    </div>
                                    <p className="text-2xl font-bold text-text-primary">{formatCurrency(avgMonthly)}</p>
                                </div>

                                <div className="p-5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50">
                                    <div className="flex items-center gap-3 mb-2 text-blue-500">
                                        <CreditCard className="w-5 h-5" />
                                        <h3 className="font-semibold text-xs uppercase tracking-wider">Ativos</h3>
                                    </div>
                                    <p className="text-2xl font-bold text-text-primary">{groups.length}</p>
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="border border-surface-200 dark:border-surface-700 p-4 rounded-xl bg-white dark:bg-surface-800/50">
                                <h3 className="text-sm font-semibold text-text-primary mb-4">Projeção (12 meses)</h3>
                                <div className="h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlyProjection}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-300)" opacity={0.3} />
                                            <XAxis
                                                dataKey="label"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                                tickFormatter={(val) => `R$${val / 1000}k`}
                                            />
                                            <Tooltip
                                                cursor={{ fill: 'var(--surface-200)', opacity: 0.2 }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(val: number | undefined) => [formatCurrency(val ?? 0), 'A Pagar'] as [string, string]}
                                            />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                {monthlyProjection.map((_entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#94a3b8'} fillOpacity={index === 0 ? 1 : 0.6} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* List */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-text-primary">Detalhamento</h3>
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                                        <input
                                            type="text"
                                            placeholder="Buscar compra..."
                                            value={filter}
                                            onChange={(e) => setFilter(e.target.value)}
                                            className="pl-9 pr-4 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-700 border-none text-sm focus:ring-2 focus:ring-primary-500/20 w-48"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-surface-50 dark:bg-surface-800 text-xs font-semibold text-text-secondary uppercase">
                                            <tr>
                                                <th className="px-4 py-3">Descrição</th>
                                                <th className="px-4 py-3 w-32">Progresso</th>
                                                <th className="px-4 py-3 text-right">Valor</th>
                                                <th className="px-4 py-3 text-right">Restante</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                                            {groups
                                                .filter(g => g.normalizedDescription.toLowerCase().includes(filter.toLowerCase()))
                                                .map((group, idx) => {
                                                    const progress = (group.currentInstallment / group.totalInstallments) * 100;
                                                    return (
                                                        <tr key={idx} className="hover:bg-surface-50 dark:hover:bg-surface-800/50">
                                                            <td className="px-4 py-3">
                                                                <div className="font-medium text-text-primary text-sm truncate max-w-[200px]">{group.normalizedDescription}</div>
                                                                <div className="text-xs text-text-muted mt-0.5">{group.origin} • Termina em {getMonthName(`${group.endDate.getFullYear()}-${String(group.endDate.getMonth() + 1).padStart(2, '0')}`).split(' ')[0]}</div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex justify-between text-[10px] text-text-secondary mb-1">
                                                                    <span>{group.currentInstallment}/{group.totalInstallments}</span>
                                                                    <span>{Math.round(progress)}%</span>
                                                                </div>
                                                                <div className="h-1.5 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-primary-500" style={{ width: `${progress}%` }} />
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">
                                                                {formatCurrency(group.installmentValue)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-sm font-bold text-text-primary">
                                                                {formatCurrency(group.remainingDebt)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
