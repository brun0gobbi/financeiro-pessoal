import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { History as HistoryIcon, Search, Download, ArrowUpDown, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { db } from '../db/schema';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { useUIStore } from '../store/uiStore';
import { CATEGORIES, getCategoryLabel, getSubcategoryLabel } from '../constants/categories';
import type { Transaction, CostCenter, TransactionOrigin } from '../db/schema';

const CENTERS: CostCenter[] = ['BRUNO', 'MARINA', 'CASA'];

export function Historico() {
    const selectedMonth = useUIStore((s) => s.selectedMonth);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<'dataEvento' | 'valor'>('dataEvento');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [originFilter, setOriginFilter] = useState<'ALL' | TransactionOrigin>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<string>('');

    const transactions = useLiveQuery(
        () => {
            if (selectedMonth === 'ALL') {
                return db.transactions.filter(t => t.statusRevisao === 'OK').toArray();
            }
            return db.transactions.where('mesCompetencia').equals(selectedMonth).and((t) => t.statusRevisao === 'OK').toArray();
        },
        [selectedMonth]
    );

    const filteredTransactions = (transactions || [])
        .filter((t) => {
            const matchesSearch = !searchQuery || t.descricaoOriginal.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesOrigin = originFilter === 'ALL' || t.origem === originFilter;
            const matchesCategory = !categoryFilter || t.categoriaMacro === categoryFilter;
            return matchesSearch && matchesOrigin && matchesCategory;
        })
        .sort((a, b) => {
            const aVal = sortField === 'dataEvento' ? new Date(a.dataEvento).getTime() : a.valor;
            const bVal = sortField === 'dataEvento' ? new Date(b.dataEvento).getTime() : b.valor;
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

    const toggleSort = (field: 'dataEvento' | 'valor') => {
        if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    };

    const updateTransaction = async (id: number, changes: Partial<Transaction>) => {
        await db.transactions.update(id, { ...changes, updatedAt: new Date() });
    };

    const revertToPending = async (id: number) => {
        if (confirm('Deseja mover esta transação de volta para Pendências?')) {
            await updateTransaction(id, { statusRevisao: 'PENDENTE' });
        }
    };

    const exportCSV = () => {
        if (!filteredTransactions.length) return;
        const headers = ['Data', 'Descrição', 'Valor', 'Tipo', 'Categoria', 'Subcategoria', 'Centro', 'Origem', 'Obs'];
        const rows = filteredTransactions.map((t) => [
            formatDate(t.dataEvento),
            `"${t.descricaoOriginal}"`,
            t.valor.toFixed(2),
            t.tipo,
            getCategoryLabel(t.categoriaMacro),
            getSubcategoryLabel(t.categoriaMacro, t.categoriaSub),
            t.centro || '',
            t.origem,
            t.observacao || ''
        ]);
        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `transacoes_${selectedMonth}.csv`;
        link.click();
    };

    // Calculate totals based on filtered view
    const totals = filteredTransactions.reduce((acc, t) => {
        if (t.tipo === 'DEBITO') {
            acc.gastos += Math.abs(t.valor);
        } else {
            acc.creditos += Math.abs(t.valor);
        }
        return acc;
    }, { gastos: 0, creditos: 0 });

    const totalFatura = totals.gastos - totals.creditos;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent/20 flex items-center justify-center">
                        <HistoryIcon className="w-6 h-6 text-primary-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">Lançamentos / Extrato</h1>
                        <p className="text-text-secondary">{filteredTransactions.length} transações aprovadas</p>
                    </div>
                </div>
                <button onClick={exportCSV} className="btn-secondary flex items-center gap-2" disabled={!filteredTransactions.length}>
                    <Download className="w-4 h-4" /> CSV
                </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                    <p className="text-sm text-text-muted">Gastos</p>
                    <p className="text-xl font-bold text-danger">{formatCurrency(totals.gastos)}</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-sm text-text-muted">Créditos</p>
                    <p className="text-xl font-bold text-success">-{formatCurrency(totals.creditos)}</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-sm text-text-muted">Total Líquido</p>
                    <p className="text-xl font-bold text-primary-400">{formatCurrency(totalFatura)}</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-surface-700 border border-white/5 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-500" />
                </div>

                {/* Category Filter */}
                <select
                    aria-label="Filtrar por Categoria"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 bg-surface-700 border border-white/5 rounded-xl text-text-primary text-sm focus:outline-none focus:border-primary-500 min-w-[200px]"
                >
                    <option value="">Todas as Categorias</option>
                    {CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                </select>

                {/* Origin Filter */}
                <div className="flex bg-surface-700 rounded-lg p-1 border border-white/5">
                    {(['ALL', 'NUBANK', 'XP', 'ITAU'] as const).map((origin) => (
                        <button
                            key={origin}
                            onClick={() => setOriginFilter(origin)}
                            className={cn(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                originFilter === origin
                                    ? "bg-primary-500 text-white shadow-sm"
                                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                            )}
                        >
                            {origin === 'ALL' ? 'Todos' : origin}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead><tr className="border-b border-white/5">
                        <th className="w-8"></th>
                        <th onClick={() => toggleSort('dataEvento')} className="px-4 py-3 text-left text-sm font-medium text-text-secondary cursor-pointer"><span className="flex items-center gap-1">Data <ArrowUpDown className="w-3 h-3" /></span></th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Descrição</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Categoria</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Subcategoria</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Origem</th>
                        <th onClick={() => toggleSort('valor')} className="px-4 py-3 text-right text-sm font-medium text-text-secondary cursor-pointer"><span className="flex items-center justify-end gap-1">Valor <ArrowUpDown className="w-3 h-3" /></span></th>
                    </tr></thead>
                    <tbody>
                        {filteredTransactions.map((t) => (
                            <>
                                <tr key={t.id} onClick={() => setExpandedId(expandedId === t.id ? null : t.id!)} className={cn("border-b border-white/5 hover:bg-surface-700/50 cursor-pointer transition-colors", expandedId === t.id && "bg-surface-700/50")}>
                                    <td className="px-4 py-3 text-center">
                                        {expandedId === t.id ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap">{formatDate(t.dataEvento)}</td>
                                    <td className="px-4 py-3 text-sm text-text-primary">
                                        {t.merchantNormalized || t.descricaoOriginal}
                                        {t.observacao && <span className="ml-2 text-xs text-text-muted italic">({t.observacao})</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm"><span className="px-2 py-1 bg-surface-600 rounded text-xs whitespace-nowrap">{getCategoryLabel(t.categoriaMacro) || '-'}</span></td>
                                    <td className="px-4 py-3 text-sm"><span className="text-xs text-text-secondary">{getSubcategoryLabel(t.categoriaMacro, t.categoriaSub) || '-'}</span></td>
                                    <td className="px-4 py-3 text-sm"><span className={cn('px-2 py-1 rounded text-xs font-bold', t.origem === 'NUBANK' && 'bg-purple-500/20 text-purple-400', t.origem === 'XP' && 'bg-yellow-500/20 text-yellow-400', t.origem === 'ITAU' && 'bg-orange-500/20 text-orange-400')}>{t.origem}</span></td>
                                    <td className={cn('px-4 py-3 text-sm text-right font-medium', t.tipo === 'DEBITO' ? 'text-danger' : 'text-success')}>{formatCurrency(t.valor)}</td>
                                </tr>
                                {expandedId === t.id && (
                                    <tr className="bg-surface-700/30">
                                        <td colSpan={7} className="p-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                                                <div>
                                                    <label className="text-xs text-text-muted block mb-1">Categoria Principal</label>
                                                    <select
                                                        aria-label="Categoria Principal"
                                                        value={t.categoriaMacro || ''} onChange={(e) => updateTransaction(t.id!, { categoriaMacro: e.target.value })} className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary">
                                                        <option value="">Selecione...</option>
                                                        {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-text-muted block mb-1">Subcategoria</label>
                                                    <select
                                                        aria-label="Subcategoria"
                                                        value={t.categoriaSub || ''} onChange={(e) => updateTransaction(t.id!, { categoriaSub: e.target.value })} disabled={!t.categoriaMacro} className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary disabled:opacity-50">
                                                        <option value="">Selecione...</option>
                                                        {t.categoriaMacro && CATEGORIES.find(c => c.id === t.categoriaMacro)?.subcategories?.map((sub) => <option key={sub.id} value={sub.id}>{sub.label}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-text-muted block mb-1">Centro de Custo</label>
                                                    <select
                                                        aria-label="Centro de Custo"
                                                        value={t.centro || ''} onChange={(e) => updateTransaction(t.id!, { centro: e.target.value as CostCenter })} className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary">
                                                        {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex items-end">
                                                    <button onClick={() => revertToPending(t.id!)} className="w-full py-2 bg-warning/10 text-warning hover:bg-warning/20 rounded-lg flex items-center justify-center gap-2 transition-colors">
                                                        <RotateCcw className="w-4 h-4" /> Desaprovar / Reabrir
                                                    </button>
                                                </div>
                                                <div className="col-span-full mt-2">
                                                    <label className="text-xs text-text-muted block mb-1">Observações</label>
                                                    <input type="text" defaultValue={t.observacao || ''} onBlur={(e) => updateTransaction(t.id!, { observacao: e.target.value })} className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary" placeholder="Adicione detalhes..." />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </>
                        ))}
                    </tbody>
                </table>
                {filteredTransactions.length === 0 && (
                    <div className="p-12 text-center">
                        <p className="text-text-muted mb-2">Nenhuma transação encontrada.</p>
                        <p className="text-sm text-text-secondary">
                            Tente alterar os filtros ou o mês selecionado.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
