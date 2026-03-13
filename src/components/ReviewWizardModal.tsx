import { useState, useEffect } from 'react';
import { TRANSACTIONS_CATEGORIES_MAP } from '../constants/categories';
import { formatCurrency, formatDate, formatCategoryName } from '../lib/utils';
import type { Transaction } from '../db/schema';
import { db } from '../db/schema';
import { Check, X, Sparkles, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface ReviewWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidates: Transaction[];
}

export function ReviewWizardModal({ isOpen, onClose, candidates }: ReviewWizardModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);

    // Edit state
    const [category, setCategory] = useState('');
    const [subcategory, setSubcategory] = useState('');

    const loadTransaction = (t: Transaction) => {
        setCurrentTransaction(t);
        setCategory(t.categoriaMacro || '');
        setSubcategory(t.categoriaSub || '');
    };

    useEffect(() => {
        if (isOpen && candidates.length > 0) {
            setCurrentIndex(0);
            loadTransaction(candidates[0]);
        }
    }, [isOpen, candidates]);

    const handleNext = () => {
        if (currentIndex < candidates.length - 1) {
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            loadTransaction(candidates[nextIndex]);
        } else {
            onClose();
            toast.success("Revisão concluída! 🎉");
        }
    };

    const handleSave = async () => {
        if (!currentTransaction) return;

        try {
            await db.transactions.update(currentTransaction.id!, {
                categoriaMacro: category,
                categoriaSub: subcategory,
                statusRevisao: 'OK'
            });
            handleNext();
        } catch (error) {
            console.error("Failed to update transaction", error);
            toast.error("Erro ao salvar.");
        }
    };

    const handleSkip = () => {
        handleNext();
    };

    if (!isOpen || !currentTransaction) return null;

    const progress = ((currentIndex + 1) / candidates.length) * 100;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-[500px] shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden flex flex-col animate-slide-up">

                {/* Header */}
                <div className="p-6 border-b border-surface-100 dark:border-surface-800">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                                <Sparkles className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-text-primary">Revisão Rápida</h2>
                                <p className="text-xs text-text-secondary">Mantenha seus dados afiados</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-full transition-colors text-text-muted"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex justify-between text-xs font-medium text-text-secondary mb-1">
                        <span>Progresso</span>
                        <span>{currentIndex + 1} de {candidates.length}</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out rounded-full"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Transaction Card */}
                    <div className="bg-surface-50 dark:bg-surface-800 p-5 rounded-xl border border-surface-200 dark:border-surface-700 flex flex-col items-center text-center space-y-2 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500/20 to-transparent"></div>
                        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            {formatDate(currentTransaction.dataEvento)} • {currentTransaction.origem}
                        </span>
                        <h3 className="text-lg font-semibold text-text-primary text-pretty line-clamp-2 leading-snug">
                            {currentTransaction.descricaoOriginal}
                        </h3>
                        <span className="text-3xl font-bold text-text-primary tracking-tight mt-1 bloack">
                            {formatCurrency(currentTransaction.valor)}
                        </span>
                    </div>

                    {/* Edit Form */}
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-text-secondary ml-1">Categoria Principal</label>
                            <div className="relative">
                                <select
                                    className="w-full p-3 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-text-primary appearance-none focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                                    value={category}
                                    onChange={(e) => { setCategory(e.target.value); setSubcategory(''); }}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {Object.keys(TRANSACTIONS_CATEGORIES_MAP).map(catKey => (
                                        <option key={catKey} value={catKey}>
                                            {formatCategoryName(catKey)}
                                        </option>
                                    ))}
                                </select>
                                <ChevronRight className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
                            </div>
                        </div>

                        <div className={`space-y-1.5 transition-all duration-300 ${category ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-2 pointer-events-none'}`}>
                            <label className="text-sm font-medium text-text-secondary ml-1">Subcategoria</label>
                            <div className="relative">
                                <select
                                    className="w-full p-3 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-text-primary appearance-none focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                                    value={subcategory}
                                    onChange={(e) => setSubcategory(e.target.value)}
                                    disabled={!category}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {category && TRANSACTIONS_CATEGORIES_MAP[category]?.map(sub => (
                                        <option key={sub} value={sub}>
                                            {formatCategoryName(sub)}
                                        </option>
                                    ))}
                                </select>
                                <ChevronRight className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 pt-2 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between items-center">
                    <button
                        onClick={handleSkip}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                    >
                        Pular (Manter Atual)
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={!category}
                        className="w-full sm:flex-1 px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-primary-600/20 transition-all flex items-center justify-center gap-2 text-sm font-bold"
                    >
                        <Check className="w-4 h-4" />
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}
