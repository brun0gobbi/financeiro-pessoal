import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Clock, Upload, CreditCard, Building2, Trash2, RefreshCw, Sparkles } from 'lucide-react';
import { db } from '../db/schema';
import type { Transaction, RealtimeTransaction } from '../db/schema';
import { extractTextFromImage } from '../services/ocr/tesseractService';
import { parseNubankPrint, saveNubankParseResult } from '../services/realtime/nubankPrintParser';
import { formatCurrency, formatCategoryName } from '../lib/utils';
import { CATEGORIES } from '../constants/categories'; // Import categories
import { learnClassification } from '../services/classifier/engine'; // Import learning engine
import { toast } from 'sonner';

type SourceFilter = 'ALL' | 'NUBANK_PRINT' | 'XP_PRINT' | 'ITAU_OFX_PARTIAL';

export function TempoReal() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [activeTab, setActiveTab] = useState<'NUBANK' | 'XP' | 'ITAU'>('NUBANK');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
    const [isDragging, setIsDragging] = useState(false);

    // Live queries
    const transactions = useLiveQuery(() =>
        sourceFilter === 'ALL'
            ? db.realtimeTransactions.orderBy('uploaded_at').reverse().toArray()
            : db.realtimeTransactions.where('source').equals(sourceFilter).reverse().toArray(),
        [sourceFilter]
    );

    const snapshots = useLiveQuery(() => db.realtimeSnapshots.orderBy('uploaded_at').reverse().toArray());

    // Calculate totals
    const totals = transactions?.reduce((acc, tx) => {
        if (tx.entry_type === 'CHARGE') {
            acc.expenses += Math.abs(tx.amount_brl);
        } else {
            acc.credits += Math.abs(tx.amount_brl);
        }
        return acc;
    }, { expenses: 0, credits: 0 }) || { expenses: 0, credits: 0 };

    // Update Transaction Helpers
    const updateDescription = async (id: number, newDesc: string) => {
        await db.realtimeTransactions.update(id, { description_raw: newDesc });
    };

    const updateCategory = async (tx: RealtimeTransaction, catId: string, subId: string) => {
        // 1. Update Realtime Transaction
        await db.realtimeTransactions.update(tx.id!, {
            suggested_category: catId,
            suggested_subcategory: subId,
            categorization_confidence: 100 // User confirmed
        });

        // 2. TRIGGER LEARNING (The magic sauce)
        // Adapt RealtimeTransaction to Transaction for the classifier
        if (tx.description_normalized) {
            const tempTx: Partial<Transaction> = {
                merchantNormalized: tx.description_normalized,
                descricaoOriginal: tx.description_raw
            };

            // We use the normalized description as the pattern key
            // This ensures future imports (which also normalize) will match this rule
            await learnClassification(tempTx as Transaction, catId, subId);
            toast.success(`Aprendido: ${tx.description_normalized} -> ${formatCategoryName(catId)}`);
        }
    };

    // Process files (shared logic for click and drop)
    const processFiles = useCallback(async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;

        setIsProcessing(true);

        for (const file of Array.from(files)) {
            try {
                const isImage = file.type.startsWith('image/');
                const isOFX = file.name.toLowerCase().endsWith('.ofx');

                if (activeTab === 'NUBANK') {
                    if (!isImage) {
                        toast.warning(`Para Nubank, envie prints (imagens). Arquivo ignorado: ${file.name}`);
                        continue;
                    }

                    setProcessingStatus(`Lendo imagem Nubank: ${file.name}...`);
                    setProcessingStatus('Executando OCR (pode demorar alguns segundos)...');
                    const ocrText = await extractTextFromImage(file);

                    if (!ocrText || ocrText.trim().length < 20) {
                        toast.error(`Não foi possível ler texto da imagem: ${file.name}`);
                        continue;
                    }

                    setProcessingStatus('Processando transações...');
                    const result = await parseNubankPrint(ocrText, file.name);

                    await saveNubankParseResult(result, file.name);

                    toast.success(
                        `${file.name}: ${result.new_count} nova(s), ${result.duplicate_count} duplicada(s)`,
                        { duration: 5000 }
                    );
                } else if (activeTab === 'XP') {
                    toast.info('Parser da XP em desenvolvimento. Aguarde!');
                } else if (activeTab === 'ITAU') {
                    if (!isOFX) {
                        toast.warning(`Para Itaú, envie arquivos .OFX. Arquivo ignorado: ${file.name}`);
                        continue;
                    }
                    toast.info('Importação de OFX parcial será implementada em breve.');
                }

            } catch (error) {
                console.error('Error processing file:', error);
                toast.error(`Erro ao processar ${file.name}`);
            }
        }

        setIsProcessing(false);
        setProcessingStatus('');
    }, [activeTab]);

    // Handle file input change
    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(e.target.files);
            e.target.value = ''; // Reset input
        }
    }, [processFiles]);

    // Drag and drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    }, [processFiles]);

    // Clear all realtime data
    const handleClearAll = async () => {
        if (!confirm('Limpar TODOS os dados de Tempo Real? (Isso não afeta o Consolidado)')) return;

        await db.realtimeTransactions.clear();
        await db.realtimeSnapshots.clear();
        toast.success('Dados de Tempo Real limpos!');
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">Tempo Real</h1>
                        <p className="text-text-secondary">Mesa de Curadoria Viva (Edite aqui para ensinar o sistema)</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleClearAll}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Limpar Tudo
                    </button>
                </div>
            </div>

            {/* Warning Banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="font-medium text-amber-400">Aprendizado Ativo</p>
                    <p className="text-text-muted mt-1">
                        Ao categorizar uma transação aqui, o sistema <strong>aprende a regra</strong>.
                        Quando você importar o consolidado oficial do banco no futuro, estas transações já virão classificadas corretamente!
                    </p>
                </div>
            </div>

            {/* Upload Section with Tabs */}
            <div className="card">
                {/* Tabs */}
                <div className="flex border-b border-white/5">
                    <button
                        onClick={() => setActiveTab('NUBANK')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors relative ${activeTab === 'NUBANK'
                            ? 'text-primary-400'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                            }`}
                    >
                        <CreditCard className="w-4 h-4" />
                        Nubank (Print)
                        {activeTab === 'NUBANK' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-400" />
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('XP')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors relative ${activeTab === 'XP'
                            ? 'text-primary-400'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                            }`}
                    >
                        <CreditCard className="w-4 h-4" />
                        XP (Print)
                        {activeTab === 'XP' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-400" />
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('ITAU')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors relative ${activeTab === 'ITAU'
                            ? 'text-primary-400'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                            }`}
                    >
                        <Building2 className="w-4 h-4" />
                        Itaú (OFX)
                        {activeTab === 'ITAU' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-400" />
                        )}
                    </button>
                </div>

                {/* Upload Area */}
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-text-primary">
                            {activeTab === 'NUBANK' && 'Enviar Prints do Nubank'}
                            {activeTab === 'XP' && 'Enviar Prints da XP'}
                            {activeTab === 'ITAU' && 'Enviar OFX Parcial do Itaú'}
                        </h3>
                        <p className="text-sm text-text-secondary">
                            {activeTab === 'NUBANK' && 'Suporta PNG/JPG. O sistema identifica faturas em aberto.'}
                            {activeTab === 'XP' && 'Em breve: suporte para prints do app XP.'}
                            {activeTab === 'ITAU' && 'Em breve: suporte para OFX parcial (extrato do mês).'}
                        </p>
                    </div>

                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`
                            flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                            ${isProcessing
                                ? 'border-amber-500/50 bg-amber-500/5'
                                : isDragging
                                    ? 'border-primary-500 bg-primary-500/10'
                                    : 'border-white/10 hover:border-primary-500/50 hover:bg-primary-500/5'
                            }
                        `}
                        onClick={() => document.getElementById('file-upload-input')?.click()}
                    >
                        <input
                            id="file-upload-input"
                            type="file"
                            accept={activeTab === 'ITAU' ? ".ofx" : "image/*"}
                            multiple
                            onChange={handleFileInputChange}
                            disabled={isProcessing}
                            className="hidden"
                        />

                        {isProcessing ? (
                            <>
                                <RefreshCw className="w-10 h-10 text-amber-400 animate-spin mb-3" />
                                <p className="text-amber-400 font-medium">{processingStatus}</p>
                            </>
                        ) : (
                            <>
                                <Upload className="w-10 h-10 text-text-muted mb-3" />
                                <p className="text-text-primary font-medium">
                                    {isDragging ? 'Solte aqui!' : 'Arraste prints ou clique para selecionar'}
                                </p>
                                <p className="text-text-muted text-sm mt-1">
                                    Suporta: PNG, JPG (prints de fatura) e OFX (extrato parcial)
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/10 rounded-lg">
                            <CreditCard className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Gastos Observados</p>
                            <p className="text-xl font-bold text-red-400">{formatCurrency(totals.expenses)}</p>
                        </div>
                    </div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                            <Building2 className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Créditos/Pagamentos</p>
                            <p className="text-xl font-bold text-green-400">{formatCurrency(totals.credits)}</p>
                        </div>
                    </div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-500/10 rounded-lg">
                            <Clock className="w-5 h-5 text-primary-400" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Transações</p>
                            <p className="text-xl font-bold text-text-primary">{transactions?.length || 0}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-white/5 pb-2">
                {[
                    { id: 'ALL', label: 'Todos' },
                    { id: 'NUBANK_PRINT', label: 'Nubank' },
                    { id: 'XP_PRINT', label: 'XP' },
                    { id: 'ITAU_OFX_PARTIAL', label: 'Itaú' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setSourceFilter(tab.id as SourceFilter)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${sourceFilter === tab.id
                            ? 'bg-primary-500 text-white'
                            : 'text-text-secondary hover:bg-surface-700'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Editable Transactions Table */}
            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead className="bg-surface-700/50">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase w-[100px]">Data</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase min-w-[300px]">Descrição (Editável)</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase w-[200px]">Categoria</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase w-[200px]">Subcategoria</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase w-[120px]">Valor</th>
                            <th className="w-[50px]"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {transactions?.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-12 text-center text-text-muted">
                                    Nenhuma transação observada ainda. Envie prints para começar.
                                </td>
                            </tr>
                        )}
                        {transactions?.map((tx) => (
                            <tr key={tx.id} className="hover:bg-surface-700/30 transition-colors group">
                                {/* DATE */}
                                <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap align-top">
                                    {tx.posted_day.toString().padStart(2, '0')}/
                                    {tx.posted_month.toString().padStart(2, '0')}
                                </td>

                                {/* DETAILS & DESCRIPTION INPUT */}
                                <td className="px-4 py-3 align-top">
                                    <div className="flex flex-col gap-1">
                                        <input
                                            type="text"
                                            defaultValue={tx.description_raw}
                                            onBlur={(e) => updateDescription(tx.id!, e.target.value)}
                                            className="w-full bg-transparent border-none p-0 text-sm text-text-primary font-medium focus:ring-0 placeholder:text-text-muted/50"
                                            placeholder="Descrição..."
                                        />

                                        <div className="flex items-center gap-2 text-xs text-text-muted">
                                            {tx.is_installment && (
                                                <span className="text-primary-400">
                                                    Parc. {tx.installment_current}/{tx.installment_total}
                                                </span>
                                            )}
                                            <span className='opacity-50'>{tx.source.replace('_PRINT', '')}</span>
                                            {tx.categorization_confidence && tx.categorization_confidence > 80 && (
                                                <div className="flex items-center gap-1 text-accent" title="Confiança Alta">
                                                    <Sparkles className="w-3 h-3" />
                                                    Auto
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* CATEGORY SELECT */}
                                <td className="px-4 py-3 align-top">
                                    <select
                                        value={tx.suggested_category || ''}
                                        onChange={(e) => updateCategory(tx, e.target.value, '')}
                                        className={`w-full bg-surface-700 border-none rounded-lg text-xs py-1.5 focus:ring-1 focus:ring-primary-500 ${!tx.suggested_category ? 'text-text-muted' : 'text-text-primary'}`}
                                    >
                                        <option value="">Selecione...</option>
                                        {CATEGORIES.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                                        ))}
                                    </select>
                                </td>

                                {/* SUBCATEGORY SELECT */}
                                <td className="px-4 py-3 align-top">
                                    <select
                                        value={tx.suggested_subcategory || ''}
                                        onChange={(e) => updateCategory(tx, tx.suggested_category!, e.target.value)}
                                        disabled={!tx.suggested_category}
                                        className="w-full bg-surface-700 border-none rounded-lg text-xs py-1.5 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 text-text-primary"
                                    >
                                        <option value="">Selecione...</option>
                                        {tx.suggested_category && CATEGORIES.find(c => c.id === tx.suggested_category)?.subcategories?.map(sub => (
                                            <option key={sub.id} value={sub.id}>{sub.label}</option>
                                        ))}
                                    </select>
                                </td>

                                {/* VALUE */}
                                <td className={`px-4 py-3 text-right text-sm font-medium align-top ${tx.entry_type === 'CHARGE' ? 'text-red-400' : 'text-green-400'
                                    }`}>
                                    {tx.entry_type === 'PAYMENT_OR_CREDIT' ? '+' : '-'}
                                    {formatCurrency(Math.abs(tx.amount_brl))}
                                </td>

                                {/* DELETE ACTION */}
                                <td className="px-4 py-3 align-top text-right">
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Excluir esta transação?')) return;
                                            await db.realtimeTransactions.delete(tx.id!);
                                            toast.success('Transação removida.');
                                        }}
                                        className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Snapshots History (collapsible) */}
            {snapshots && snapshots.length > 0 && (
                <details className="card">
                    <summary className="px-4 py-3 cursor-pointer text-text-secondary hover:text-text-primary transition-colors">
                        Histórico de Uploads ({snapshots.length} snapshots)
                    </summary>
                    <div className="px-4 pb-4 space-y-2">
                        {snapshots.map((snap) => (
                            <div key={snap.id} className="flex items-center justify-between p-3 bg-surface-700/50 rounded-lg text-sm">
                                <div>
                                    <span className="text-text-primary">{snap.file_name || snap.id.slice(0, 8)}</span>
                                    <span className="text-text-muted ml-2">
                                        ({snap.new_transactions_count} novas de {snap.transactions_count})
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-text-muted">
                                        {new Date(snap.uploaded_at).toLocaleString('pt-BR')}
                                    </span>
                                    <button
                                        onClick={async () => {
                                            if (!confirm(`Deletar snapshot "${snap.file_name || snap.id.slice(0, 8)}" e suas transações?`)) return;
                                            const { deleteSnapshot } = await import('../services/realtime/nubankPrintParser');
                                            await deleteSnapshot(snap.id);
                                            toast.success('Snapshot deletado!');
                                        }}
                                        className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
                                        title="Deletar snapshot"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}
