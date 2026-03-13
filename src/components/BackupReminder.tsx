import { useState, useEffect } from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { exportData } from '../services/backup/exporter';
import { toast } from 'sonner';

const BACKUP_KEY = 'last_backup_timestamp';
const DAYS_THRESHOLD = 7;

export function BackupReminder() {
    const [shouldShow, setShouldShow] = useState(false);

    useEffect(() => {
        const lastBackup = localStorage.getItem(BACKUP_KEY);
        if (!lastBackup) {
            setShouldShow(true); // Never backed up
            return;
        }

        const daysSince = (Date.now() - parseInt(lastBackup)) / (1000 * 60 * 60 * 24);
        if (daysSince > DAYS_THRESHOLD) {
            setShouldShow(true);
        }
    }, []);

    const handleBackup = async () => {
        try {
            await exportData();
            localStorage.setItem(BACKUP_KEY, Date.now().toString());
            setShouldShow(false);
            toast.success("Backup realizado com sucesso! Arquivo salvo em Downloads.");
        } catch (error) {
            console.error("Backup failed", error);
            toast.error("Erro ao gerar backup.");
        }
    };

    const handleDismiss = () => {
        setShouldShow(false);
        // Remind again tomorrow, not immediately
        // For simplicity in this MVP, we just hide it for the session
    };

    if (!shouldShow) return null;

    return (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between animate-slide-down relative z-50">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-800 rounded-full">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                        Backup Pendente
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 hidden sm:block">
                        Faz tempo que você não salva seus dados. Baixe uma cópia por segurança.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleBackup}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 text-xs font-semibold rounded-lg transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    Fazer Backup
                </button>
                <button
                    onClick={handleDismiss}
                    className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-800 rounded-lg text-amber-600 dark:text-amber-400 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
