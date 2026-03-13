import { useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FileDropzone } from '../components/FileDropzone';
import { ImportSummaryModal } from '../components/ImportSummaryModal';
import { processFiles } from '../services/importer/processor';
import type { ImportSummary } from '../services/importer/processor';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { formatDate } from '../lib/utils';

export function Importar() {
    const navigate = useNavigate();
    const [summaryToShow, setSummaryToShow] = useState<ImportSummary | null>(null);

    // Get import history
    const importLogs = useLiveQuery(
        () => db.importLogs.orderBy('importedAt').reverse().limit(10).toArray(),
        []
    );

    const handleFilesAccepted = async (files: File[]) => {
        const summaries = await processFiles(files);
        // Show first summary (if multiple files, could iterate or show list)
        if (summaries.length > 0) {
            setSummaryToShow(summaries[0]);
        }
    };

    const handleCloseModal = () => {
        setSummaryToShow(null);
        if (summaryToShow?.success) {
            navigate('/pendencias');
        }
    };

    const handleDeleteImport = async (id: number) => {
        if (!confirm('Tem certeza? Isso apagará todas as transações importadas deste arquivo.')) return;

        try {
            await db.transaction('rw', db.transactions, db.importLogs, async () => {
                await db.transactions.where('importId').equals(id).delete();
                await db.importLogs.delete(id);
            });
        } catch (error) {
            console.error('Failed to delete import:', error);
            alert('Erro ao apagar importação.');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent/20 flex items-center justify-center">
                    <FileUp className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Importar Arquivos</h1>
                    <p className="text-text-secondary">
                        Arraste suas faturas e extratos em PDF
                    </p>
                </div>
            </div>

            {/* Dropzone */}
            <div className="card p-6">
                <FileDropzone
                    onFilesAccepted={handleFilesAccepted}
                    accept={{
                        'application/pdf': ['.pdf'],
                        'application/x-ofx': ['.ofx'],
                        'text/xml': ['.ofx'],
                        'text/plain': ['.ofx'],
                        // Fallback using extension if mime-type check fails
                    }}
                    maxFiles={10}
                />
            </div>

            {/* Supported Files Info */}
            <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Arquivos Suportados</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
                        <h4 className="font-medium text-purple-900 mb-1">Nubank</h4>
                        <p className="text-xs text-purple-700">Fatura do cartão de crédito (PDF)</p>
                    </div>
                    <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-100">
                        <h4 className="font-medium text-yellow-800 mb-1">XP Visa Infinite</h4>
                        <p className="text-xs text-yellow-700">Fatura do cartão de crédito (PDF)</p>
                    </div>
                    <div className="p-4 rounded-lg bg-orange-50 border border-orange-100">
                        <h4 className="font-medium text-orange-900 mb-1">Itaú</h4>
                        <p className="text-xs text-orange-700">Extrato da conta corrente (OFX/Money 2000)</p>
                    </div>
                </div>
            </div>

            {/* Import History */}
            {importLogs && importLogs.length > 0 && (
                <div className="card p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                        Histórico de Importações
                    </h3>
                    <div className="space-y-2">
                        {importLogs.map((log) => (
                            <div
                                key={log.id}
                                className="flex items-center justify-between p-3 bg-surface-700/50 rounded-xl group hover:bg-surface-700 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`
                    px-2 py-1 rounded text-xs font-bold
                    ${log.origem === 'NUBANK' && 'bg-purple-500/20 text-purple-400'}
                    ${log.origem === 'XP' && 'bg-yellow-500/20 text-yellow-400'}
                    ${log.origem === 'ITAU' && 'bg-orange-500/20 text-orange-400'}
                  `}>
                                        {log.origem}
                                    </span>
                                    <span className="text-text-primary">{log.fileName}</span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-text-secondary">
                                    <span>{log.transactionsCount} transações</span>
                                    <span>{formatDate(log.importedAt)}</span>
                                    <button
                                        onClick={() => handleDeleteImport(log.id!)}
                                        className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Apagar importação"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Import Summary Modal */}
            <ImportSummaryModal
                summary={summaryToShow}
                onClose={handleCloseModal}
            />
        </div>
    );
}
