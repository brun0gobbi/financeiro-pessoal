/**
 * Normaliza o nome do estabelecimento para facilitar a classificação.
 * Ex: "AMAZONMKTPLC*NESTLEBRA" -> "AMAZON"
 * Ex: "UBER *TRIP" -> "UBER"
 */
export function normalizeMerchant(raw: string): string {
    if (!raw) return '';

    // 1. Converter para Uppercase e remover espaços extras
    let normalized = raw.trim().toUpperCase();

    // 2. Remover acentos
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 3. Remover prefixos comuns de pagamento
    const prefixes = [
        'PG *', 'PAG *', 'PAGTO *', 'PAGAMENTO ',
        'DL *', 'DM *', 'MP *', 'INT *', 'EBN *', 'PAYPAL *', 'PP *',
        'GOOGLE *', 'APPLE.COM/BILL', 'IOF DE '
    ];

    for (const prefix of prefixes) {
        if (normalized.startsWith(prefix)) {
            normalized = normalized.substring(prefix.length);
        }
    }

    // Apple specific handling
    if (normalized.includes('APPLE.COM')) return 'APPLE';

    // 4. Remover padrões de parcelas e datas
    // Ex: " - Parcela 1/10", " 01/12"
    normalized = normalized.replace(/\s*-\s*PARCELA\s*\d+\/\d+/g, '');
    normalized = normalized.replace(/\s+\d{2}\/\d{2}/g, ''); // datas simples

    // 5. Tratar separadores de adquirentes (*, -, .)
    // Muitos nomes vêm como "EMPRESA*DETALHE" ou "EMPRESA-CIDADE"

    if (normalized.includes('*')) {
        // Pega a primeira parte se for relevante, ou trata casos específicos
        const parts = normalized.split('*');
        if (parts[0].length > 2) {
            normalized = parts[0].trim();
        }
    }

    if (normalized.includes(' - ')) {
        const parts = normalized.split(' - ');
        if (parts[0].length > 2) {
            normalized = parts[0].trim();
        }
    }

    // 6. Remover sufixos de localização comuns (cidades grandes ou BR)
    const suffixes = [
        ' SAO PAULO', ' RIO DE JANEI', ' CURITIBA', ' BELO HORIZ', ' BRASILIA',
        ' SALVADOR', ' RECIFE', ' BR', ' BRA'
    ];

    for (const suffix of suffixes) {
        if (normalized.endsWith(suffix)) {
            normalized = normalized.substring(0, normalized.length - suffix.length);
        }
    }

    // 7. Remover LTDA, SA, ME, EIRELI no final
    normalized = normalized.replace(/\s+(LTDA|SA|S\/A|ME|EPP|EIRELI)$/, '');

    // 8. Limpezas finais
    // UBER TRIP -> UBER
    if (normalized.startsWith('UBER')) return 'UBER';
    if (normalized.startsWith('99APP')) return '99 APP';
    if (normalized.startsWith('IFOOD')) return 'IFOOD';
    if (normalized.startsWith('AMAZON')) return 'AMAZON';
    if (normalized.startsWith('MERCADOLIVRE') || normalized.startsWith('MERCADO LIVRE') || normalized.startsWith('MELI ')) return 'MERCADO LIVRE';

    // Casos específicos Nubank/Bancários
    if (normalized.includes('PAGAMENTO DE FATURA')) return 'PAGAMENTO FATURA';

    return normalized.trim();
}
