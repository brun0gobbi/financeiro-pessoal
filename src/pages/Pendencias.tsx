import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    Inbox,
    CheckCircle2,
    Tag,
    ChevronDown,
    ChevronRight,
    Search,
    Filter,
    Sparkles
} from 'lucide-react';
import { db } from '../db/schema';
import type { Transaction, CostCenter } from '../db/schema';
import { CATEGORIES, getCategoryLabel, getSubcategoryLabel } from '../constants/categories';
import { learnClassification } from '../services/classifier/engine';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type FilterType = 'all' | 'no-category' | 'low-confidence' | 'installment';

const CENTERS: CostCenter[] = ['BRUNO', 'MARINA', 'CASA'];

export function Pendencias() {
    const [filter, setFilter] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [expandedId, setExpandedId] = useState<number | null>(null);

    // Get pending transactions
    const pendingTransactions = useLiveQuery(
        () =>
            db.transactions
                .where('statusRevisao')
                .equals('PENDENTE')
                .toArray(),
        []
    );

    // Filter transactions
    const filteredTransactions = (pendingTransactions || [])
        .filter((t) => {
            // Search filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const desc = t.descricaoOriginal.toLowerCase();
                const merch = (t.merchantNormalized || '').toLowerCase();
                if (!desc.includes(q) && !merch.includes(q)) return false;
            }
            // Type filter
            switch (filter) {
                case 'no-category':
                    return !t.categoriaMacro;
                case 'low-confidence':
                    return t.confiancaClassificacao < 70;
                case 'installment':
                    return t.parcelado;
                default:
                    return true;
            }
        })
        .sort((a, b) => {
            // First: Identified (with category) comes first
            const aHasCat = !!a.categoriaMacro;
            const bHasCat = !!b.categoriaMacro;
            if (aHasCat && !bHasCat) return -1;
            if (!aHasCat && bHasCat) return 1;

            // Second: Date (Newest first)
            return new Date(b.dataEvento).getTime() - new Date(a.dataEvento).getTime();
        });

    // Toggle selection
    const toggleSelect = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Select all
    const selectAll = () => {
        if (selectedIds.size === filteredTransactions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredTransactions.map((t) => t.id!)));
        }
    };

    // Approve selected
    const approveSelected = async () => {
        const txs = await db.transactions.where('id').anyOf([...selectedIds]).toArray();
        for (const t of txs) {
            if (t.categoriaMacro) {
                await learnClassification(t, t.categoriaMacro, t.categoriaSub || '');
            }
        }

        await db.transactions
            .where('id')
            .anyOf([...selectedIds])
            .modify({ statusRevisao: 'OK', updatedAt: new Date() });
        setSelectedIds(new Set());
    };

    // Approve single
    const approveOne = async (id: number) => {
        const t = await db.transactions.get(id);
        if (t && t.categoriaMacro) {
            await learnClassification(t, t.categoriaMacro, t.categoriaSub || '');
        }
        await db.transactions.update(id, { statusRevisao: 'OK', updatedAt: new Date() });
    };

    // Update category & LEARN
    const updateCategory = async (t: Transaction, catId: string, subId: string) => {
        // Update transaction
        await db.transactions.update(t.id!, {
            categoriaMacro: catId,
            categoriaSub: subId,
            confiancaClassificacao: 100, // Manually corrected = 100% confidence
            updatedAt: new Date()
        });

        // Trigger learning
        if (t.merchantNormalized) {
            await learnClassification(t, catId, subId);
            console.log(`Learned: ${t.merchantNormalized} -> ${catId}/${subId}`);
        }
    };

    const updateCenter = async (id: number, centro: CostCenter) => {
        await db.transactions.update(id, { centro, updatedAt: new Date() });
    };

    const updateObservation = async (id: number, val: string) => {
        await db.transactions.update(id, { observacao: val, updatedAt: new Date() });
    };

    // Approve all pre-categorized transactions in bulk
    const approvePreCategorized = async () => {
        const preCategorized = (pendingTransactions || []).filter(t => !!t.categoriaMacro);
        if (preCategorized.length === 0) {
            alert('Nenhuma transação pré-categorizada para aprovar.');
            return;
        }
        if (!confirm(`Aprovar ${preCategorized.length} transações pré-categorizadas?`)) return;

        for (const t of preCategorized) {
            if (t.categoriaMacro) {
                await learnClassification(t, t.categoriaMacro, t.categoriaSub || '');
            }
            await db.transactions.update(t.id!, { statusRevisao: 'OK', updatedAt: new Date() });
        }
    };

    const pendingCount = pendingTransactions?.length || 0;
    const preCategorizedCount = (pendingTransactions || []).filter(t => !!t.categoriaMacro).length;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-warning/20 to-danger/20 flex items-center justify-center">
                        <Inbox className="w-6 h-6 text-warning" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">Pendências</h1>
                        <p className="text-text-secondary">
                            {pendingCount === 0
                                ? 'Tudo revisado! 🎉'
                                : `${pendingCount} transações aguardando revisão`}
                        </p>
                    </div>
                </div>
                {preCategorizedCount > 0 && (
                    <button
                        onClick={approvePreCategorized}
                        className="btn-primary flex items-center gap-2"
                    >
                        <Sparkles className="w-4 h-4" />
                        Aprovar {preCategorizedCount} Pré-categorizadas
                    </button>
                )}
            </div>

            {/* Filters & Search */}
            <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[250px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Buscar por descrição ou estabelecimento..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-surface-700 border border-white/5 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-500"
                    />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-text-muted" />
                    {(['all', 'no-category', 'low-confidence', 'installment'] as FilterType[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                                filter === f
                                    ? 'bg-primary-500 text-white'
                                    : 'bg-surface-700 text-text-secondary hover:text-text-primary'
                            )}
                        >
                            {{
                                all: 'Todas',
                                'no-category': 'Sem categoria',
                                'low-confidence': 'Baixa confiança',
                                installment: 'Parceladas',
                            }[f]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Batch Actions */}
            {selectedIds.size > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl"
                >
                    <span className="text-sm text-primary-400 font-medium">
                        {selectedIds.size} selecionada(s)
                    </span>
                    <div className="flex-1" />
                    <button
                        onClick={approveSelected}
                        className="btn-primary flex items-center gap-2 py-2"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Aprovar selecionadas
                    </button>
                </motion.div>
            )}

            {/* Transaction List */}
            {filteredTransactions.length === 0 ? (
                <div className="card p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">
                        Inbox Zero! 🎉
                    </h3>
                    <p className="text-text-secondary">
                        Todas as transações foram revisadas. Importe novos arquivos para continuar.
                    </p>
                </div>
            ) : ( // <-- Fixed typo here
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary">
                        <input
                            type="checkbox"
                            checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                            onChange={selectAll}
                            className="w-4 h-4 rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500"
                        />
                        <span>Selecionar todas</span>
                    </div>

                    <AnimatePresence>
                        {filteredTransactions.map((t) => (
                            <motion.div
                                key={t.id}
                                layoutId={`tx-${t.id}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -100 }}
                                className="card overflow-hidden group"
                            >
                                {/* Main Row */}
                                <div className="flex items-center gap-4 p-4">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(t.id!)}
                                        onChange={() => toggleSelect(t.id!)}
                                        className="w-4 h-4 rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500"
                                    />

                                    <button
                                        onClick={() => setExpandedId(expandedId === t.id ? null : t.id!)}
                                        className="p-1 rounded hover:bg-surface-700"
                                    >
                                        {expandedId === t.id ? (
                                            <ChevronDown className="w-4 h-4 text-text-muted" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-text-muted" />
                                        )}
                                    </button>

                                    {/* Description & Normalized Merchant */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-text-primary font-medium truncate">
                                                {t.merchantNormalized || t.descricaoOriginal}
                                            </p>
                                            {t.isAutoClassified && (
                                                <div title="Classificado Automaticamente">
                                                    <Sparkles className="w-3 h-3 text-accent fill-accent/20" />
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-text-muted truncate">
                                            {t.merchantNormalized ? t.descricaoOriginal : ''}
                                            {t.merchantNormalized ? ' • ' : ''}
                                            {formatDate(t.dataEvento)} • {t.mesCompetencia}
                                            {t.parcelado && ` • Parcela ${t.parcelaNum}/${t.parcelaTotal}`}
                                        </p>
                                    </div>

                                    {/* Category pill */}
                                    {t.categoriaMacro ? (
                                        <div className="hidden sm:flex flex-col items-end">
                                            <span className="px-2 py-1 bg-surface-600 rounded-lg text-xs text-text-secondary mb-0.5">
                                                {getCategoryLabel(t.categoriaMacro)}
                                            </span>
                                            {t.categoriaSub && (
                                                <span className="text-[10px] text-text-muted">
                                                    {getSubcategoryLabel(t.categoriaMacro, t.categoriaSub)}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="hidden sm:flex px-2 py-1 bg-warning/20 rounded-lg text-xs text-warning items-center gap-1">
                                            <Tag className="w-3 h-3" /> Sem categoria
                                        </span>
                                    )}

                                    {/* Value */}
                                    <span className={cn(
                                        'font-semibold tabular-nums whitespace-nowrap',
                                        t.tipo === 'DEBITO' ? 'text-danger' : 'text-success'
                                    )}>
                                        {t.tipo === 'DEBITO' ? '-' : '+'}{formatCurrency(t.valor)}
                                    </span>

                                    {/* Approve button */}
                                    <button
                                        onClick={() => approveOne(t.id!)}
                                        className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="Aprovar"
                                        aria-label="Aprovar transação"
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Expanded Details */}
                                <AnimatePresence>
                                    {expandedId === t.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-white/5 bg-surface-700/50"
                                        >
                                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                                {/* Category Select */}
                                                <div>
                                                    <label className="text-xs text-text-muted block mb-1">Categoria Principal</label>
                                                    <select
                                                        value={t.categoriaMacro || ''}
                                                        onChange={(e) => updateCategory(t, e.target.value, '')}
                                                        aria-label="Categoria Principal"
                                                        className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary"
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {CATEGORIES.map((c) => (
                                                            <option key={c.id} value={c.id}>{c.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Subcategory Select */}
                                                <div>
                                                    <label className="text-xs text-text-muted block mb-1">Subcategoria</label>
                                                    <select
                                                        value={t.categoriaSub || ''}
                                                        onChange={(e) => updateCategory(t, t.categoriaMacro!, e.target.value)}
                                                        disabled={!t.categoriaMacro}
                                                        aria-label="Subcategoria"
                                                        className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary disabled:opacity-50"
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {t.categoriaMacro && CATEGORIES.find(c => c.id === t.categoriaMacro)?.subcategories?.map((sub) => (
                                                            <option key={sub.id} value={sub.id}>{sub.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Center Select */}
                                                <div>
                                                    <label className="text-xs text-text-muted block mb-1">Centro de Custo</label>
                                                    <select
                                                        value={t.centro || ''}
                                                        onChange={(e) => updateCenter(t.id!, e.target.value as CostCenter)}
                                                        aria-label="Centro de Custo"
                                                        className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary"
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {CENTERS.map((c) => (
                                                            <option key={c} value={c}>{c}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Tipo (Débito/Crédito) */}
                                                <div>
                                                    <label className="text-xs text-text-muted block mb-1">Tipo</label>
                                                    <select
                                                        value={t.tipo}
                                                        onChange={(e) => db.transactions.update(t.id!, { tipo: e.target.value as 'DEBITO' | 'CREDITO', updatedAt: new Date() })}
                                                        aria-label="Tipo"
                                                        className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary"
                                                    >
                                                        <option value="DEBITO">Débito (Despesa)</option>
                                                        <option value="CREDITO">Crédito (Receita)</option>
                                                    </select>
                                                </div>

                                                {/* Observation Field - Full Width */}
                                                <div className="col-span-full mt-2">
                                                    <label className="text-xs text-text-muted block mb-1">Observações / Detalhes (para aprendizado futuro)</label>
                                                    <input
                                                        type="text"
                                                        defaultValue={t.observacao || ''}
                                                        placeholder="Ex: Almoço com a equipe, Uber para aeroporto..."
                                                        onBlur={(e) => updateObservation(t.id!, e.target.value)}
                                                        className="w-full px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary-500 transition-colors"
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
