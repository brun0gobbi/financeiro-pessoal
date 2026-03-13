import { type Transaction, type TransactionType } from '../../db/schema';
import { type PdfExtractResult } from '../importer/processor';

// User defined strict Ignore List
const IGNORE_PATTERNS = [
    /saldo anterior/i,
    /saldo final/i,
    /saldo em/i,
    /^total/i,
    /^resumo/i,
    /aplic aut/i, // Aplicações automáticas
    /res aplic aut/i, // Resgates automáticos
    /rend pago/i, // Rendimentos
    /tarifas/i,
    /pacote de servi/i,
    /notas explicativas/i,
    /extrato mensal/i,
    /conta corrente \|/i,
    /movimenta/i,
    /\(créditos\)/i,
    /\(débitos\)/i,
    /totalizador/i,
    /cheque especial/i,
    /dbitos automticos/i,
    /crdito pr-aprovado/i
];

function isIgnored(line: string): boolean {
    const normalize = line.trim().toLowerCase();
    if (!normalize) return true;
    // Check regex patterns
    return IGNORE_PATTERNS.some(pattern => pattern.test(normalize));
}

function parseDate(dateStr: string, currentYear: string): Date | null {
    // Expects "dd/mm"
    if (!/^\d{2}\/\d{2}$/.test(dateStr)) return null;
    const [day, month] = dateStr.split('/');
    return new Date(Number(currentYear), Number(month) - 1, Number(day));
}

function parseValue(valueStr: string): number | null {
    // Identify if valid value format: 1.000,00 or 1.000,00-
    // Regex: starts with digits/dots, has comma, ends with 2 digits, optional minus
    const valueRegex = /^[\d\.]+,(\d{2})(-?)$/;
    const match = valueStr.trim().match(valueRegex);

    if (!match) return null;

    // Parse value
    let v = valueStr.replace(/\./g, '').replace(',', '.').replace('-', '');
    let num = parseFloat(v);

    if (valueStr.includes('-')) {
        num = -Math.abs(num);
    }

    return num;
}

export async function extractItauTransactions(pdfData: PdfExtractResult): Promise<Transaction[]> {
    const transactions: Transaction[] = [];

    // Default year from PDF header detection or current
    let currentYear = pdfData.invoiceYear ? pdfData.invoiceYear.toString() : new Date().getFullYear().toString();
    const yearRegex = /^[a-z]{3}\s(20\d{2})$/i; // "nov 2025"

    // State Machine
    let lastDate: Date | null = null;
    let pendingDescription: string | null = null;
    let skipNextValue = false;

    // Patterns that indicate the NEXT value should be ignored (Balances, Sweeps)
    const VALUE_SKIP_PATTERNS = [
        /saldo anterior/i,
        /saldo final/i,
        /saldo em/i,
        /saldo aplic aut/i,
        /apl aplic aut/i,   // Corrected from "aplic aplic"
        /res aplic aut/i,
        /rend pago/i
    ];

    outerLoop:
    for (const page of pdfData.pages) {
        // Use the pre-extracted lines from processor (which are already Y-aligned)
        const lines = page.lines.filter((str: string) => str.trim().length > 0);

        for (let j = 0; j < lines.length; j++) {
            const line = lines[j].trim();

            // Check Skip Value Patterns
            if (VALUE_SKIP_PATTERNS.some(p => p.test(line))) {
                skipNextValue = true;
                continue;
            }

            // 1. Try to find Year in Header (usually early lines)
            const yearMatch = line.match(yearRegex);
            if (yearMatch) {
                currentYear = yearMatch[1];
                console.log('Detected Year:', currentYear);
                continue;
            }

            if (isIgnored(line)) continue;

            // 2. Is it a Date? (dd/mm)
            const date = parseDate(line, currentYear);
            if (date) {
                lastDate = date;
                continue; // Next line likely description or value
            }

            // 3. Is it a Value?
            const value = parseValue(line);
            if (value !== null && lastDate) {
                if (skipNextValue) {
                    console.log('Skipping Value per pattern:', value);
                    skipNextValue = false;
                    continue;
                }

                if (pendingDescription) {
                    const tipo: TransactionType = value < 0 ? 'DEBITO' : 'CREDITO';

                    transactions.push({
                        origem: 'ITAU',
                        tipo,
                        dataEvento: lastDate,
                        mesCompetencia: lastDate.toISOString().slice(0, 7),
                        descricaoOriginal: pendingDescription,
                        valor: value, // Negative for debit, positive for credit
                        moeda: 'BRL',
                        recorrente: false,
                        parcelado: false,
                        confiancaClassificacao: 0,
                        statusRevisao: 'PENDENTE',
                        hash: '',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });

                    pendingDescription = null; // Consumed
                }
                continue;
            }

            // 4. Description Capture
            if (lastDate) {
                pendingDescription = line;
            }
        }
    }

    // Post-process hashes
    return transactions.map(t => ({
        ...t,
        hash: crypto.randomUUID()
    }));
}
