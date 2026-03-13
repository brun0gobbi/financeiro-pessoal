import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, X, Calendar, CreditCard, ArrowRight } from 'lucide-react';
import type { ImportSummary } from '../services/importer/processor';
import { formatCurrency } from '../lib/utils';

interface ImportSummaryModalProps {
    summary: ImportSummary | null;
    onClose: () => void;
}

export function ImportSummaryModal({ summary, onClose }: ImportSummaryModalProps) {
    if (!summary) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-surface-800 border border-white/10 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className={`p-6 ${summary.success ? 'bg-success/10' : 'bg-warning/10'}`}>
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                {summary.success ? (
                                    <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                                        <CheckCircle2 className="w-6 h-6 text-success" />
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6 text-warning" />
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-xl font-bold text-text-primary">
                                        {summary.success ? 'Importação Concluída!' : 'Arquivo Ignorado'}
                                    </h2>
                                    <p className="text-sm text-text-secondary">
                                        {summary.fileName}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                aria-label="Fechar"
                                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5 text-text-muted" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {summary.skippedFile ? (
                            <p className="text-text-secondary">
                                Este arquivo já foi importado anteriormente. Verifique a tela de Pendências ou Histórico.
                            </p>
                        ) : (
                            <>
                                {/* Stats Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    {summary.dueDate && (
                                        <div className="bg-surface-700/50 rounded-xl p-4">
                                            <div className="flex items-center gap-2 text-text-muted text-sm mb-1">
                                                <Calendar className="w-4 h-4" />
                                                Vencimento
                                            </div>
                                            <p className="text-lg font-semibold text-text-primary">
                                                {summary.dueDate}
                                            </p>
                                        </div>
                                    )}
                                    {summary.totalValue && (
                                        <div className="bg-surface-700/50 rounded-xl p-4">
                                            <div className="flex items-center gap-2 text-text-muted text-sm mb-1">
                                                <CreditCard className="w-4 h-4" />
                                                Valor Total
                                            </div>
                                            <p className="text-lg font-semibold text-danger">
                                                {formatCurrency(summary.totalValue)}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Transactions Count */}
                                <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4">
                                    <p className="text-center">
                                        <span className="text-3xl font-bold text-primary-400">
                                            {summary.addedTransactions}
                                        </span>
                                        <span className="text-text-secondary ml-2">
                                            transações importadas
                                        </span>
                                    </p>
                                    {summary.totalTransactions !== summary.addedTransactions && (
                                        <p className="text-center text-sm text-text-muted mt-1">
                                            ({summary.totalTransactions - summary.addedTransactions} duplicadas ignoradas)
                                        </p>
                                    )}
                                </div>

                                {/* First & Last Transaction */}
                                {summary.firstTransaction && summary.lastTransaction && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-text-muted font-medium">Período das transações</p>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 bg-surface-700/50 rounded-lg p-3">
                                                <p className="text-xs text-text-muted">Primeira</p>
                                                <p className="text-sm text-text-primary font-medium truncate">
                                                    {summary.firstTransaction.description}
                                                </p>
                                                <p className="text-xs text-text-secondary">
                                                    {summary.firstTransaction.date} • {formatCurrency(summary.firstTransaction.value)}
                                                </p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
                                            <div className="flex-1 bg-surface-700/50 rounded-lg p-3">
                                                <p className="text-xs text-text-muted">Última</p>
                                                <p className="text-sm text-text-primary font-medium truncate">
                                                    {summary.lastTransaction.description}
                                                </p>
                                                <p className="text-xs text-text-secondary">
                                                    {summary.lastTransaction.date} • {formatCurrency(summary.lastTransaction.value)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 pb-6">
                        <button
                            onClick={onClose}
                            className="btn-primary w-full py-3"
                        >
                            {summary.success ? 'Ver Pendências' : 'Entendi'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
