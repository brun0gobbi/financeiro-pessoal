import { type Transaction, type TransactionType } from '../../db/schema';

// Helper to clean strings
function normalizeString(str: string): string {
    return str
        .replace(/\s+/g, ' ') // Collapse spaces
        .trim();
}

// Helper to detect date in description (DD MM)
function extractDateHint(desc: string, currentYear: number): Date | null {
    // Look for "DD MM" at the end of string
    const match = desc.match(/\s(\d{2})\s(\d{2})$/);
    if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1; // 0-indexed
        return new Date(currentYear, month, day);
    }
    return null;
}

export function parseOfxContent(text: string): Transaction[] {
    const transactions: Transaction[] = [];

    // Regex to find blocks of STMTTRN
    const transactionBlockRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
    let match;

    while ((match = transactionBlockRegex.exec(text)) !== null) {
        const block = match[1];

        // 1. RAW PARSING
        const dateMatch = block.match(/<DTPOSTED>(\d{8})/); // YYYYMMDD
        const amountMatch = block.match(/<TRNAMT>(.*)/);
        const idMatch = block.match(/<FITID>(.*)/);
        const memoMatch = block.match(/<MEMO>(.*)/);

        if (dateMatch && amountMatch && memoMatch) {
            const rawDateStr = dateMatch[1]; // 20251125
            const year = parseInt(rawDateStr.substring(0, 4));
            const month = parseInt(rawDateStr.substring(4, 6)) - 1;
            const day = parseInt(rawDateStr.substring(6, 8));

            const dtPosted = new Date(year, month, day);

            // Amount: comma or dot (OFX std is dot)
            const amountRaw = amountMatch[1].replace(',', '.');
            let amount = parseFloat(amountRaw);

            const memoRaw = normalizeString(memoMatch[1]);
            const fitId = idMatch ? idMatch[1].trim() : crypto.randomUUID();

            // 2. ENRICHMENT & CLASSIFICATION
            let cleanDesc = memoRaw;
            let counterparty = '';

            const memoUpper = memoRaw.toUpperCase();

            // --- 3.1 PIX ---
            if (memoUpper.startsWith('PIX TRANSF ')) {
                let rest = memoRaw.substring(11).trim(); // "MARINA 10 11"
                // Extract DD MM hint if present
                const dateHint = extractDateHint(rest, year);
                if (dateHint) {
                    rest = rest.replace(/\s\d{2}\s\d{2}$/, '').trim();
                }
                counterparty = rest;
                cleanDesc = `${counterparty}`;
            }
            else if (memoUpper.startsWith('PIX QRS ')) {
                let rest = memoRaw.substring(8).trim();
                const dateHint = extractDateHint(rest, year);
                if (dateHint) {
                    rest = rest.replace(/\s\d{2}\s\d{2}$/, '').trim();
                }
                counterparty = rest;
                cleanDesc = `${counterparty}`;
            }
            else if (memoUpper.startsWith('SISPAG PIX ')) {
                let rest = memoRaw.substring(11).trim();
                counterparty = rest;
                cleanDesc = `${counterparty}`;
            }

            // --- 3.2 TED ---
            else if (memoUpper.startsWith('TED ')) {
                const tedMatch = memoRaw.match(/^TED\s+\d+\s+\d+\s+(.*)/i);
                if (tedMatch) {
                    counterparty = tedMatch[1].trim();
                    cleanDesc = `${counterparty}`;
                }
            }

            // --- 3.3 BOLETO ---
            else if (memoUpper.startsWith('PAG BOLETO ')) {
                let rest = memoRaw.substring(11).trim();
                counterparty = rest;
                cleanDesc = `Boleto: ${counterparty}`;
            }

            // --- 3.4 DEBITO AUTOMATICO ---
            else if (memoUpper.startsWith('DA ')) {
                let rest = memoRaw.substring(3).trim();
                // Heuristic: remove long trailing numbers (ref codes)
                rest = rest.replace(/\s\d{6,}$/, '');
                counterparty = rest;
                cleanDesc = `${counterparty}`;
            }

            // --- 3.5 APLICACAO ---
            else if (memoUpper.startsWith('REND PAGO APLIC AUT')) {
                cleanDesc = 'Rendimento Aplicação Automática';
            }
            else if (memoUpper.includes('APLIC AUT MAIS')) {
                cleanDesc = 'Aplicação Automática';
            }

            // --- 3.6 OUTROS ---
            else if (memoUpper.includes('PAGTO EM CONTA CORREN') || memoUpper.includes('CREDITO EM CONTA')) {
                cleanDesc = 'Crédito em Conta';
            }

            // Determine Type
            const tipo: TransactionType = amount < 0 ? 'DEBITO' : 'CREDITO';

            // Construct Final Transaction
            transactions.push({
                origem: 'ITAU',
                tipo,
                dataEvento: dtPosted,
                mesCompetencia: dtPosted.toISOString().slice(0, 7),
                descricaoOriginal: cleanDesc, // Enriched description
                valor: amount,
                moeda: 'BRL',
                recorrente: false,
                parcelado: false,
                confiancaClassificacao: 1,
                statusRevisao: 'PENDENTE',
                hash: fitId, // CRITICAL: Use Bank's Unique ID
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
    }

    return transactions;
}

export async function extractOfxTransactions(file: File): Promise<Transaction[]> {
    const text = await file.text();
    return parseOfxContent(text);
}
