import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { getMonthName } from '../lib/utils';

export function MonthSelector() {
    const { selectedMonth, setSelectedMonth } = useUIStore();

    const goToPreviousMonth = () => {
        if (selectedMonth === 'ALL') {
            goToCurrentMonth();
            return;
        }
        const [year, month] = selectedMonth.split('-').map(Number);
        const prevDate = new Date(year, month - 2, 1);
        setSelectedMonth(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
    };

    const goToNextMonth = () => {
        if (selectedMonth === 'ALL') {
            goToCurrentMonth();
            return;
        }
        const [year, month] = selectedMonth.split('-').map(Number);
        const nextDate = new Date(year, month, 1);
        const now = new Date();

        // Don't go beyond current month
        if (nextDate <= new Date(now.getFullYear(), now.getMonth(), 1)) {
            setSelectedMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`);
        }
    };

    const goToCurrentMonth = () => {
        const now = new Date();
        setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    };

    const isCurrentMonth = () => {
        const now = new Date();
        const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return selectedMonth === current;
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={goToPreviousMonth}
                className="p-2 rounded-lg hover:bg-surface-700 transition-colors text-text-secondary hover:text-text-primary"
                title="Mês anterior"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-700/50 min-w-[200px] justify-center">
                <Calendar className="w-4 h-4 text-primary-400" />
                <span className="font-medium capitalize">{getMonthName(selectedMonth)}</span>
            </div>

            <button
                onClick={goToNextMonth}
                disabled={isCurrentMonth()}
                className="p-2 rounded-lg hover:bg-surface-700 transition-colors text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                title="Próximo mês"
            >
                <ChevronRight className="w-5 h-5" />
            </button>

            {!isCurrentMonth() && selectedMonth !== 'ALL' && (
                <button
                    onClick={goToCurrentMonth}
                    className="ml-2 px-3 py-1.5 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 transition-colors"
                >
                    Mês Atual
                </button>
            )}

            {selectedMonth !== 'ALL' && (
                <button
                    onClick={() => setSelectedMonth('ALL')}
                    className="ml-1 px-3 py-1.5 text-sm bg-surface-700 hover:bg-surface-600 text-text-secondary hover:text-text-primary rounded-lg transition-colors border border-surface-600"
                    title="Ver todas as transações"
                >
                    Tudo
                </button>
            )}
        </div>
    );
}
