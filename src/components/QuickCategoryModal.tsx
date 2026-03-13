import { useState, useEffect } from 'react';
import { db, type Transaction } from '../db/schema';
import { formatCurrency, cn, formatCategoryName } from '../lib/utils';
import { X, Check, Save, Copy } from 'lucide-react';


interface QuickCategoryModalProps {
    transaction: Transaction;
    isOpen: boolean;
    onClose: () => void;
    onSave: (transaction: Transaction, newCategory: string, newSubCategory: string, learn: boolean, observation: string) => void;
}

const CATEGORIES = [
    { key: 'moradia', label: 'Moradia', color: '#dc2626' },
    { key: 'mercado', label: 'Mercado', color: '#16a34a' },
    { key: 'alimentacao_lazer', label: 'Alimentação & Lazer', color: '#f59e0b' },
    { key: 'transporte', label: 'Transporte', color: '#2563eb' },
    { key: 'saude', label: 'Saúde', color: '#db2777' },
    { key: 'assinaturas', label: 'Assinaturas', color: '#7c3aed' },
    { key: 'servicos_financeiros', label: 'Serviços Financeiros', color: '#71717a' },
    { key: 'viagens', label: 'Viagens', color: '#0d9488' },
    { key: 'investimentos', label: 'Investimentos', color: '#65a30d' },
    { key: 'compras', label: 'Compras Diversas', color: '#0891b2' }
];

// Subcategories suggestions per category
const SUBCATEGORIES: Record<string, string[]> = {
    'moradia': ['Aluguel', 'Condomínio', 'Luz', 'Água', 'Gás', 'Internet', 'IPTU', 'Manutenção'],
    'mercado': ['Supermercado', 'Feira', 'Hortifruti', 'Açougue', 'Padaria'],
    'alimentacao_lazer': ['Restaurante', 'Delivery', 'Bar', 'Café', 'Lanches', 'Cinema', 'Shows', 'Jogos', 'Athletico'],
    'transporte': ['Uber', 'Combustível', '99', 'Estacionamento', 'Pedágio', 'Manutenção Carro', 'Seguro Auto'],
    'saude': ['Farmácia', 'Consultas', 'Exames', 'Academia', 'Plano de Saúde', 'Dentista', 'Terapia'],
    'assinaturas': ['Streaming', 'Spotify', 'Netflix', 'Apps', 'Softwares', 'Jogos', 'Jornais'],
    'servicos_financeiros': ['Tarifas', 'IOF', 'Anuidade', 'Juros', 'Seguros'],
    'viagens': ['Passagens', 'Hospedagem', 'Alimentação Viagem', 'Passeios', 'Aluguel Carro'],
    'investimentos': ['Ações', 'FIIs', 'Renda Fixa', 'Crypto', 'Previdência'],
    'compras': ['Roupas', 'Eletrônicos', 'Casa', 'Presentes', 'Livros', 'Esportes', 'Pets']
};

export function QuickCategoryModal({ transaction, isOpen, onClose, onSave }: QuickCategoryModalProps) {
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [customCategory, setCustomCategory] = useState('');
    const [subCategory, setSubCategory] = useState('');
    const [learn, setLearn] = useState(true);
    const [observation, setObservation] = useState('');

    // Similar transactions logic
    const [similarTransactions, setSimilarTransactions] = useState<Transaction[]>([]);
    const [step, setStep] = useState<'categorize' | 'similars'>('categorize');
    const [selectedSimilars, setSelectedSimilars] = useState<Set<number>>(new Set());
    const [isSearching, setIsSearching] = useState(false);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStep('categorize');
            setSimilarTransactions([]);
            setSelectedSimilars(new Set());
            setIsSearching(false);

            if (transaction) {
                setObservation(transaction.observacao || '');
                setSubCategory(transaction.categoriaSub || '');
                setSelectedCategory(transaction.categoriaMacro || '');
                setCustomCategory('');
            }
        }
    }, [transaction, isOpen]);

    const toggleSimilar = (id: number) => {
        setSelectedSimilars(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (!isOpen || !transaction) return null;

    const handleSave = async (applyToSimilar = false) => {
        const finalCategory = customCategory || selectedCategory;
        if (!finalCategory) return;

        // Step 1: Check for similars if we are in categorization step
        if (step === 'categorize') {
            setIsSearching(true);
            try {
                // Heuristic: Match start of description (first 15 chars)
                const searchKey = transaction.descricaoOriginal.substring(0, 15);

                // Find all similar transactions, regardless of status (to allow re-categorization)
                const similars = await db.transactions
                    .filter(t =>
                        t.id !== transaction.id &&
                        t.descricaoOriginal.startsWith(searchKey)
                    )
                    .toArray();

                if (similars.length > 0) {
                    setSimilarTransactions(similars);
                    setSelectedSimilars(new Set(similars.map(t => t.id!))); // Init selection
                    setStep('similars');
                    setIsSearching(false);
                    return;
                }
            } catch (err) {
                console.error("Error searching similars:", err);
            }
            setIsSearching(false);
        }

        // Step 2: Apply changes
        if (applyToSimilar && similarTransactions.length > 0) {
            // Apply only to Checked transactions
            const targets = similarTransactions.filter(t => selectedSimilars.has(t.id!));

            if (targets.length > 0) {
                await Promise.all(targets.map(t => db.transactions.update(t.id!, {
                    categoriaMacro: finalCategory,
                    categoriaSub: subCategory,
                    observacao: observation,
                    statusRevisao: 'OK',
                    updatedAt: new Date()
                })));
            }
        }

        // Apply to current
        onSave(transaction, finalCategory, subCategory, learn, observation);
        onClose();
    };

    const availableSubcategories = selectedCategory ? SUBCATEGORIES[selectedCategory] || [] : [];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface-50 dark:bg-surface-800 rounded-2xl w-full max-w-lg shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-surface-200 dark:border-surface-700 flex justify-between items-start shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-text-primary">
                            {step === 'categorize' ? 'Categorizar Lançamento' : 'Lançamentos Similares'}
                        </h2>
                        <p className="text-sm text-text-secondary mt-1">
                            {step === 'categorize' ? 'Onde este gasto se encaixa melhor?' : 'Encontramos outros itens parecidos.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-lg transition-colors" title="Fechar">
                        <X className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                {/* Body - Scrollable */}
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                    {step === 'categorize' ? (
                        <>
                            {/* Transaction Preview */}
                            <div className="bg-surface-100 dark:bg-surface-900 rounded-xl p-4 flex justify-between items-center border border-surface-200 dark:border-surface-700 shrink-0">
                                <div>
                                    <p className="font-semibold text-text-primary text-lg">{transaction.descricaoOriginal}</p>
                                    <p className="text-sm text-text-muted">
                                        {transaction.dataEvento.toLocaleDateString('pt-BR')} • {transaction.origem}
                                    </p>
                                </div>
                                <span className="font-bold text-xl text-text-primary">
                                    {formatCurrency(transaction.valor)}
                                </span>
                            </div>

                            {/* Observation Field */}
                            <div>
                                <label className="text-sm font-medium text-text-secondary mb-2 block">O que foi isso? (Opcional)</label>
                                <textarea
                                    value={observation}
                                    onChange={(e) => setObservation(e.target.value)}
                                    placeholder="Ex: Jantar com a equipe, Presente de aniversário..."
                                    className="w-full px-4 py-3 rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-text-primary text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none h-20"
                                />
                            </div>

                            {/* Category Grid */}
                            <div>
                                <label className="text-sm font-medium text-text-secondary mb-3 block">Categoria Principal:</label>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    {CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.key}
                                            onClick={() => {
                                                setSelectedCategory(cat.key);
                                                setSubCategory(''); // Reset sub when changing category
                                                setCustomCategory(''); // Clear custom when selecting preset
                                            }}
                                            className={cn(
                                                "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                                                selectedCategory === cat.key && !customCategory
                                                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500"
                                                    : "border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 bg-surface-50 dark:bg-surface-800"
                                            )}
                                        >
                                            <div
                                                className="w-3 h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: cat.color }}
                                            />
                                            <span className={cn(
                                                "font-medium truncate text-sm",
                                                selectedCategory === cat.key && !customCategory ? "text-primary-700 dark:text-primary-400" : "text-text-secondary"
                                            )}>
                                                {cat.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* Custom Category Input */}
                                <div className="border-t border-surface-200 dark:border-surface-700 pt-3 mt-2">
                                    <label className="text-sm font-medium text-text-secondary mb-2 block">
                                        Ou crie uma nova:
                                    </label>
                                    <input
                                        type="text"
                                        value={customCategory}
                                        onChange={(e) => {
                                            setCustomCategory(e.target.value);
                                            if (e.target.value) {
                                                setSelectedCategory(''); // Clear preset selection when typing custom
                                            }
                                        }}
                                        placeholder="Ex: Educação, Hobbies..."
                                        className={cn(
                                            "w-full px-4 py-3 rounded-xl bg-surface-50 dark:bg-surface-900 border text-text-primary text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all",
                                            customCategory
                                                ? "border-primary-500 ring-1 ring-primary-500"
                                                : "border-surface-200 dark:border-surface-700"
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Subcategory Chips */}
                            {selectedCategory && (
                                <div className="animate-fade-in mb-4">
                                    <label className="text-sm font-medium text-text-secondary mb-2 block">
                                        Subcategoria:
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {/* Show current saved value as chip if not in predefined list */}
                                        {subCategory && !availableSubcategories.includes(subCategory) && (
                                            <button
                                                type="button"
                                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-500 text-white shadow-md"
                                            >
                                                {subCategory}
                                            </button>
                                        )}
                                        {availableSubcategories.map((sub) => (
                                            <button
                                                key={sub}
                                                onClick={() => setSubCategory(sub)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                                    subCategory === sub
                                                        ? "bg-primary-500 text-white shadow-md"
                                                        : "bg-surface-100 dark:bg-surface-700 text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-600"
                                                )}
                                            >
                                                {sub}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Custom Subcategory Input */}
                            {selectedCategory && (
                                <div className="animate-fade-in">
                                    <label className="text-sm font-medium text-text-secondary mb-2 block">
                                        {availableSubcategories.length > 0 ? 'Ou digite outra:' : 'Subcategoria:'}
                                    </label>
                                    <input
                                        type="text"
                                        value={subCategory}
                                        onChange={(e) => setSubCategory(e.target.value)}
                                        placeholder="Ex: Roupas, Tênis, Futebol..."
                                        className="w-full px-4 py-3 rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-text-primary text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                                    />
                                </div>
                            )}

                            {/* Learning Checkbox */}
                            <div className="flex items-start gap-3 p-4 bg-primary-50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/20 cursor-pointer" onClick={() => setLearn(!learn)}>
                                <div className={cn(
                                    "w-5 h-5 rounded border flex items-center justify-center mt-0.5 transition-colors",
                                    learn
                                        ? "bg-primary-500 border-primary-500 text-white"
                                        : "bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600"
                                )}>
                                    {learn && <Check className="w-3.5 h-3.5" />}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-text-primary text-sm">Aprender padrão</p>
                                    <p className="text-xs text-text-secondary mt-0.5">
                                        Aplicar categoria e subcategoria para futuros lançamentos similares.
                                    </p>
                                </div>
                            </div>
                        </>
                    ) : (
                        // Similars Confirmation Step
                        <div className="space-y-6 animate-fade-in">
                            <div className="bg-primary-50 dark:bg-primary-900/10 p-5 rounded-2xl border border-primary-100 dark:border-primary-900/30 flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center shrink-0 text-primary-600 dark:text-primary-400">
                                    <Copy className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-text-primary text-lg">Encontrei {similarTransactions.length} similares</h3>
                                    <p className="text-text-secondary mt-1 leading-relaxed">
                                        Deseja aplicar a categoria <strong>{formatCategoryName(customCategory || selectedCategory)}</strong>
                                        {subCategory && <> e subcategoria <strong>{formatCategoryName(subCategory)}</strong></>} também para estes lançamentos?
                                    </p>
                                </div>
                            </div>

                            <div className="card border border-surface-200 dark:border-surface-700 overflow-hidden">
                                <div className="bg-surface-50 dark:bg-surface-800 px-4 py-2 border-b border-surface-200 dark:border-surface-700 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                                    Lançamentos Pendentes
                                </div>
                                <div className="max-h-[250px] overflow-y-auto">
                                    {similarTransactions.map((t, idx) => (
                                        <div
                                            key={t.id}
                                            onClick={() => t.id && toggleSimilar(t.id)}
                                            className={cn(
                                                "flex justify-between items-center p-4 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors cursor-pointer group",
                                                idx !== similarTransactions.length - 1 && "border-b border-surface-100 dark:border-surface-800"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                                {/* Checkbox */}
                                                <div className={cn(
                                                    "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                                                    selectedSimilars.has(t.id!)
                                                        ? "bg-primary-500 border-primary-500 text-white"
                                                        : "bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 group-hover:border-primary-400"
                                                )}>
                                                    {selectedSimilars.has(t.id!) && <Check className="w-3.5 h-3.5" />}
                                                </div>

                                                <div>
                                                    <p className="font-medium text-text-primary truncate">{t.descricaoOriginal}</p>
                                                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                                                        <span>{t.dataEvento.toLocaleDateString('pt-BR')}</span>
                                                        <span>•</span>
                                                        <span>{t.origem}</span>
                                                        {t.statusRevisao === 'OK' && (
                                                            <span className="text-success-600 bg-success-50 dark:bg-success-900/20 px-1.5 py-0.5 rounded ml-1">
                                                                OK
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="font-medium text-text-primary whitespace-nowrap">
                                                {formatCurrency(t.valor)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-surface-200 dark:border-surface-700 flex justify-end gap-3 bg-surface-50 dark:bg-surface-800 shrink-0">
                    {step === 'categorize' ? (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleSave(false)}
                                disabled={(!selectedCategory && !customCategory) || isSearching}
                                className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2"
                            >
                                {isSearching ? (
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Salvar
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setStep('categorize')}
                                className="px-4 py-2 rounded-xl text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors font-medium mr-auto"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={() => handleSave(false)}
                                className="px-5 py-2 rounded-xl text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-transparent hover:border-primary-200 dark:hover:border-primary-800 transition-all font-semibold"
                            >
                                Apenas este
                            </button>
                            <button
                                onClick={() => handleSave(true)}
                                disabled={selectedSimilars.size === 0}
                                className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2"
                            >
                                <Copy className="w-4 h-4" />
                                Aplicar selecionados ({selectedSimilars.size + 1})
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
