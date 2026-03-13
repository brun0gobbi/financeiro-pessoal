import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format a number as Brazilian currency (R$)
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

/**
 * Format a date as DD/MM/YYYY
 */
export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('pt-BR');
}

/**
 * Get month name in Portuguese
 */
export function getMonthName(yearMonth: string): string {
    if (!yearMonth || yearMonth === 'ALL') return 'Todo o Período';
    const [year, month] = yearMonth.split('-').map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/**
 * Generate a deterministic hash for deduplication
 */
export async function generateTransactionHash(
    origem: string,
    data: string,
    descricao: string,
    valor: number
): Promise<string> {
    const input = `${origem}|${data}|${descricao}|${valor.toFixed(2)}`;
    const encoder = new TextEncoder();
    const data_buffer = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data_buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the last N months as YYYY-MM strings
 */
export function getLastNMonths(n: number): string[] {
    const months: string[] = [];
    const now = new Date();

    for (let i = 0; i < n; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }

    return months;
}

/**
 * Detect if a transaction description looks like an installment (parcela)
 * Returns { isParcelado, parcelaNum, parcelaTotal } or null
 */
export function detectInstallment(descricao: string): { parcelaNum: number; parcelaTotal: number } | null {
    // Common patterns: "2/10", "02/10", "Parcela 2 de 10", "2 de 10"
    const patterns = [
        /(\d{1,2})\/(\d{1,2})/,
        /parcela\s*(\d{1,2})\s*de\s*(\d{1,2})/i,
        /(\d{1,2})\s*de\s*(\d{1,2})/,
    ];

    for (const pattern of patterns) {
        const match = descricao.match(pattern);
        if (match) {
            const num = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            if (num > 0 && total > 1 && num <= total) {
                return { parcelaNum: num, parcelaTotal: total };
            }
        }
    }

    return null;
}

/**
 * Normalize description to group installments (removes "01/10", "1a parc", etc)
 */
export function normalizeTransactionDescription(description: string): string {
    let normalized = description;

    // Remove "01/12", "1/12" pattern
    normalized = normalized.replace(/(\d{1,2})\s*\/\s*(\d{1,2})/g, '');

    // Remove "Parcela X de Y" pattern
    normalized = normalized.replace(/parcela\s*(\d{1,2})\s*de\s*(\d{1,2})/gi, '');

    // Remove "X de Y" pattern
    normalized = normalized.replace(/(\d{1,2})\s*de\s*(\d{1,2})/gi, '');

    // Clean up
    return normalized
        .replace(/[*-]/g, ' ') // Remove spec chars often used as separators
        .replace(/\s+/g, ' ')  // Collapse spaces
        .trim();
}

/**
 * Format category key to user friendly label
 */
export function formatCategoryName(category: string): string {
    const map: Record<string, string> = {
        'moradia': 'Moradia',
        'mercado': 'Mercado',
        'alimentacao_lazer': 'Alimentação & Lazer',
        'transporte': 'Transporte',
        'saude': 'Saúde',
        'assinaturas': 'Assinaturas',
        'compras': 'Compras Diversas',
        'servicos_financeiros': 'Serviços Financeiros',
        'viagens': 'Viagens',
        'investimentos': 'Investimentos',
        'impostos': 'Impostos',
        'nao_classificado': 'Não Identificado'
    };
    return map[category] || category.replace(/_/g, ' ').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function getReviewCandidates(transactions: any[]) {
    // Candidates are:
    // 1. Completely unclassified ('nao_classificado')
    // 2. Generic categories ('compras', 'alimentacao_lazer') WITHOUT a specific subcategory
    // 3. Must be significant value (> 30) - lowered threshold to catch more

    const strictCandidates = transactions.filter(t => {
        // Priority 1: No category at all
        if (!t.categoriaMacro || t.categoriaMacro === 'nao_classificado') return true;

        // Priority 2: Generic categories that need refinement (missing subcategory)
        const needsRefinement = ['compras', 'alimentacao_lazer', 'outros'].includes(t.categoriaMacro);
        const hasNoSub = !t.categoriaSub;

        // Filter out small coffee/snacks to avoid noise, focus on the "unknowns"
        const isWorthReviewing = t.valor > 30;

        return (needsRefinement && hasNoSub) && isWorthReviewing;
    }).sort((a, b) => b.valor - a.valor);

    // If we have enough strict candidates, return them
    if (strictCandidates.length >= 5) {
        return strictCandidates.slice(0, 5);
    }

    // Spot Check: Fill the rest with random "OK" transactions to keep the user engaged
    // Filter out already selected strict candidates
    const strictIds = new Set(strictCandidates.map(t => t.id));

    // Get pool for spot check (transactions that are NOT strict candidates)
    // We prefer recent ones (last 3 months approx, assuming list is somewhat ordered or we just pick from all)
    // To make it interesting, let's pick from ANY transaction > 50 R$ to be meaningful
    const spotCheckPool = transactions.filter(t =>
        !strictIds.has(t.id) &&
        Math.abs(t.valor) > 50
    );

    // Shuffle pool
    const shuffled = [...spotCheckPool].sort(() => 0.5 - Math.random());
    const needed = 5 - strictCandidates.length;
    const spotChecks = shuffled.slice(0, needed);

    return [...strictCandidates, ...spotChecks];
}
