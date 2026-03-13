import type { Transaction } from '../db/schema';
import { formatCurrency, formatCategoryName } from '../lib/utils';
import { Sparkles, ArrowRight } from 'lucide-react';

interface ReviewAssistantWidgetProps {
    transaction: Transaction;
    onCategorize: (t: Transaction) => void;
    onSkip: () => void;
}

export function ReviewAssistantWidget({ transaction, onCategorize, onSkip }: ReviewAssistantWidgetProps) {
    if (!transaction) return null;

    return (
        <div className="bg-gradient-to-r from-primary-500/10 to-primary-600/5 border border-primary-500/20 rounded-2xl p-6 relative overflow-hidden animate-fade-in group">
            {/* Background Decor */}
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                        <Sparkles className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    </div>

                    <div>
                        <h3 className="font-semibold text-text-primary text-lg">Curadoria Rápida</h3>
                        <p className="text-text-secondary text-sm mb-3">
                            Ajude a classificar este gasto para melhorar seus gráficos:
                        </p>

                        <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3 border border-surface-200 dark:border-surface-700">
                            <div className="flex justify-between items-center gap-8">
                                <div>
                                    <p className="font-medium text-text-primary">{transaction.descricaoOriginal}</p>
                                    <p className="text-xs text-text-muted">
                                        {transaction.dataEvento.toLocaleDateString('pt-BR')} • {transaction.origem}
                                    </p>
                                </div>
                                <span className="font-bold text-lg text-text-primary">
                                    {formatCurrency(transaction.valor)}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                            <span>Atualmente classificado como:</span>
                            <span className="px-2 py-0.5 rounded bg-surface-200 dark:bg-surface-700 text-text-secondary font-medium">
                                {formatCategoryName(transaction.categoriaMacro || 'Desconhecido')}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                    <button
                        onClick={onSkip}
                        className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-surface-300 dark:border-surface-600 text-text-secondary hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors text-sm font-medium"
                    >
                        Pular
                    </button>
                    <button
                        onClick={() => onCategorize(transaction)}
                        className="flex-1 md:flex-none px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/20 transition-all flex items-center justify-center gap-2 text-sm font-bold"
                    >
                        Categorizar
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
