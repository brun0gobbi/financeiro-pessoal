import { X, Search, Calendar } from 'lucide-react';
import type { Transaction } from '../db/schema';
import { formatCurrency, formatDate } from '../lib/utils';
import { useState } from 'react';

interface DrilldownModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    transactions: Transaction[];
    onTransactionClick?: (t: Transaction) => void;
}

export function DrilldownModal({ isOpen, onClose, title, transactions, onTransactionClick }: DrilldownModalProps) {
    const [searchTerm, setSearchTerm] = useState('');

    if (!isOpen) return null;

    const filteredTransactions = transactions
        .filter(t =>
            t.descricaoOriginal.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.categoriaMacro || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => b.dataEvento.getTime() - a.dataEvento.getTime()); // Sort by date descending

    const totalValue = filteredTransactions.reduce((acc, t) => acc + t.valor, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface-50 dark:bg-surface-800 rounded-2xl w-full max-w-3xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="p-6 border-b border-surface-200 dark:border-surface-700 flex justify-between items-start shrink-0 bg-white dark:bg-surface-800">
                    <div>
                        <h2 className="text-xl font-bold text-text-primary">{title}</h2>
                        <p className="text-sm text-text-secondary mt-1">
                            {filteredTransactions.length} lançamentos • Total: <span className="font-semibold text-text-primary">{formatCurrency(totalValue)}</span>
                        </p>
                    </div>
                    <button onClick={onClose} title="Fechar" className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors text-text-secondary">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search & List */}
                <div className="p-4 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                        <input
                            type="text"
                            placeholder="Buscar nestes lançamentos..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 focus:ring-2 focus:ring-primary-500/20 text-sm"
                        />
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-surface-50 dark:bg-surface-800 text-xs font-semibold text-text-secondary uppercase sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 border-b border-surface-200 dark:border-surface-700">Data</th>
                                <th className="px-6 py-3 border-b border-surface-200 dark:border-surface-700">Descrição</th>
                                <th className="px-6 py-3 border-b border-surface-200 dark:border-surface-700 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100 dark:divide-surface-700 bg-white dark:bg-surface-800">
                            {filteredTransactions.map((t, idx) => (
                                <tr
                                    key={t.id || idx}
                                    className={`hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors ${onTransactionClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onTransactionClick?.(t)}
                                >
                                    <td className="px-6 py-3 text-sm text-text-secondary whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatDate(t.dataEvento)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="text-sm font-medium text-text-primary text-ellipsis overflow-hidden">
                                            {t.descricaoOriginal}
                                        </div>
                                        <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                                            <span className="bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-semibold">
                                                {t.origem}
                                            </span>
                                            {t.parcelado && (
                                                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded text-[10px]">
                                                    {t.parcelaNum}/{t.parcelaTotal}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <span className={`text-sm font-medium whitespace-nowrap ${t.valor > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {formatCurrency(t.valor)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {filteredTransactions.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-text-muted text-sm">
                                        Nenhum lançamento encontrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-xs text-center text-text-muted">
                    Exibindo {filteredTransactions.length} de {transactions.length} lançamentos
                </div>
            </div>
        </div>
    );
}
