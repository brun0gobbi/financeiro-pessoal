import { useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
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
                <div className="card overflow-hidden">
                    <div className="px-6 py-4 border-b border-surface-700">
                        <h3 className="text-lg font-semibold text-text-primary">
                            Histórico de Importações
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-surface-700/50 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 w-24">Origem</th>
                                    <th className="px-4 py-3">Arquivo</th>
                                    <th className="px-4 py-3 text-right w-28">Transações</th>
                                    <th className="px-4 py-3 text-right w-36">Valor Total</th>
                                    <th className="px-4 py-3 text-right w-32">Vencimento</th>
                                    <th className="px-4 py-3 text-right w-40">Data de Importação</th>
                                    <th className="px-4 py-3 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-700/50">
                                {importLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-surface-700/30 transition-colors group">
                                        <td className="px-4 py-3">
                                            <span className={`
                                                inline-block px-2 py-1 rounded text-xs font-bold
                                                ${log.origem === 'NUBANK' ? 'bg-purple-500/20 text-purple-400' : ''}
                                                ${log.origem === 'XP' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                                                ${log.origem === 'ITAU' ? 'bg-orange-500/20 text-orange-400' : ''}
                                            `}>
                                                {log.origem}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-text-primary max-w-[280px] truncate" title={log.fileName}>
                                            {log.fileName}
                                        </td>
                                        <td className="px-4 py-3 text-right text-text-secondary">
                                            {log.transactionsCount}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-text-primary">
                                            {log.totalValue != null ? formatCurrency(log.totalValue) : <span className="text-text-muted">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-text-secondary">
                                            {log.dueDate ? new Date(log.dueDate).toLocaleDateString('pt-BR') : <span className="text-text-muted">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-text-secondary">
                                            {formatDate(log.importedAt)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleDeleteImport(log.id!)}
                                                className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Apagar importação"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
