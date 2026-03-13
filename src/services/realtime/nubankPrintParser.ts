import type { RealtimeTransaction, RealtimeSource, Transaction } from '../../db/schema';
import { db } from '../../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { classifyTransaction } from '../classifier/engine';

// ============== TYPES ==============

interface ParsedLine {
    posted_day: number;
    posted_month: number;
    posted_year: number | null;
    description_raw: string;
    amount_brl: number;
    is_installment: boolean;
    installment_current?: number;
    installment_total?: number;
    installment_label_raw?: string;
    entry_type: 'CHARGE' | 'PAYMENT_OR_CREDIT';
    confidence: number;
}

interface ParseResult {
    snapshot_id: string;
    statement_month_label: string;
    transactions: RealtimeTransaction[];
    new_count: number;
    duplicate_count: number;
}

// ============== CONSTANTS ==============

const MONTH_MAP: Record<string, number> = {
    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12,
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
    'outubro': 10, 'novembro': 11, 'dezembro': 12
};

// ============== NORMALIZATION ==============

/**
 * Normalize description for deduplication and memory lookup.
 */
export function normalizeDescription(raw: string): string {
    return raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^\w\s]/g, ' ')        // Remove punctuation
        .replace(/\s+/g, ' ')            // Collapse spaces
        .trim();
}

/**
 * Generate a dedupe key for a transaction.
 */
function generateDedupeKey(
    statementMonthLabel: string,
    day: number,
    month: number,
    year: number | null,
    descNorm: string,
    amount: number,
    installmentCurrent?: number,
    installmentTotal?: number
): string {
    const yearStr = year !== null ? year.toString() : 'null';
    const installmentStr = installmentCurrent && installmentTotal
        ? `${installmentCurrent}/${installmentTotal}`
        : 'nao_parcelado';

    return `${statementMonthLabel}|${day}-${month}-${yearStr}|${descNorm}|${amount.toFixed(2)}|${installmentStr}`;
}

// ============== OCR NORMALIZATION ==============

/**
 * List of lines to skip (UI elements, headers, etc.)
 */
const STOP_LINES = [
    /^fatura$/i,
    /^tudo$/i,
    /^cart[oõ]es$/i,
    /^gr[aá]fico$/i,
    /^pagar$/i,
    /^limite/i,
    /^saldo/i,
    /^resumo/i,
    /^vencimento/i,
    /^fechamento/i,
    /^pagamento\s+m[ií]nimo/i,
    /^valor\s+da\s+fatura/i,
    /^\d{5,}$/,  // Long numbers (IDs, etc.)
    /^\d{1,2}:\d{2}/,  // Time patterns
    /^[<>]/,  // Navigation symbols
];

/**
 * Normalize OCR text to fix common misreadings.
 * - OS JAN → 03 JAN (O read as 0, S read as 3)
 * - O3 JAN → 03 JAN (O read as 0)
 * - R$59,66 → R$ 59,66 (normalize spacing)
 */
function normalizeOCRText(text: string): string {
    return text
        // Fix "OS" at start of date (OCR reads 03 as OS)
        .replace(/\bOS\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/gi, '03 $1')
        // Fix "O" followed by digit (OCR reads 0 as O)
        .replace(/\bO(\d)\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/gi, '0$1 $2')
        // Fix numbers stuck together (03JAN → 03 JAN)
        .replace(/(\d{2})(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)/gi, '$1 $2')
        // Normalize R$ spacing (R$59 → R$ 59)
        .replace(/R\$(\d)/gi, 'R$ $1');
}

/**
 * Check if a line looks like a date (DD MMM)
 */
function isDateLine(line: string): RegExpMatchArray | null {
    return line.match(/^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/i);
}

/**
 * Check if a line contains a value (R$ XX,XX)
 */
function extractValue(line: string): number | null {
    const match = line.match(/R\$\s*([\d.]+,\d{2})/i);
    if (match) {
        const valueStr = match[1]
            .replace(/\./g, '')  // Remove thousands separator
            .replace(',', '.');  // Decimal separator
        const value = parseFloat(valueStr);
        return isNaN(value) ? null : value;
    }
    return null;
}

/**
 * Check if a line contains installment info (Parcela X/Y or X/Y)
 */
function extractInstallment(line: string): { current: number; total: number; raw: string } | null {
    const match = line.match(/(?:parcela\s*)?(\d{1,2})\s*[\/]\s*(\d{1,2})/i);
    if (match) {
        return {
            current: parseInt(match[1], 10),
            total: parseInt(match[2], 10),
            raw: match[0]
        };
    }
    return null;
}

/**
 * Check if line should be skipped
 */
function shouldSkipLine(line: string): boolean {
    if (!line || line.length < 2) return true;
    return STOP_LINES.some(pattern => pattern.test(line));
}

/**
 * Extract the statement month label from OCR text.
 * Tolerant regex for OCR errors.
 */
function extractStatementMonthLabel(text: string): string | null {
    // More tolerant pattern
    const regex = /(janeiro|fevereiro|fev|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s*)?(\d{4})/i;
    const match = text.match(regex);

    if (match) {
        let monthName = match[1].toLowerCase();
        // Normalize abbreviated months
        if (monthName === 'fev') monthName = 'fevereiro';
        monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        return `${monthName} de ${match[2]}`;
    }

    return null;
}

/**
 * Infer the year from the statement month and transaction month.
 */
function inferYear(statementMonthLabel: string, transactionMonth: number): number | null {
    const yearMatch = statementMonthLabel.match(/(\d{4})/);
    if (!yearMatch) return null;

    const statementYear = parseInt(yearMatch[1], 10);
    const monthMatch = statementMonthLabel.toLowerCase().match(/(\w+)\s+de/);

    if (monthMatch) {
        const statementMonth = MONTH_MAP[monthMatch[1].toLowerCase()] || 1;
        if (transactionMonth > statementMonth + 1) {
            return statementYear - 1;
        }
    }

    return statementYear;
}

// ============== STATE MACHINE PARSER ==============

interface TransactionBlock {
    dateDay: number;
    dateMonth: number;
    descriptionLines: string[];
    value: number | null;
    installment: { current: number; total: number; raw: string } | null;
}

/**
 * Parse OCR text using a state machine approach.
 * Accumulates lines into blocks: DATE → DESCRIPTION(s) → VALUE
 */
export async function parseNubankPrint(
    ocrText: string,
    _fileName?: string
): Promise<ParseResult> {
    const snapshotId = uuidv4();
    const uploadedAt = Date.now();
    const source: RealtimeSource = 'NUBANK_PRINT';

    // Normalize OCR errors
    const normalizedText = normalizeOCRText(ocrText);
    console.log('[Parser] Normalized OCR text:', normalizedText);

    // Extract statement month
    const statementMonthLabel = extractStatementMonthLabel(normalizedText) || 'Desconhecido';
    console.log('[Parser] Statement Month:', statementMonthLabel);

    // Split into lines and clean
    const lines = normalizedText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

    console.log('[Parser] Total lines after normalization:', lines.length);

    // State machine: accumulate blocks
    // Rule: blocks close only when we see the NEXT date line
    // IMPORTANT: Merchant often comes BEFORE the date in Nubank OCR
    const blocks: TransactionBlock[] = [];
    let currentBlock: TransactionBlock | null = null;
    let pendingMerchant: string | null = null;

    for (const line of lines) {
        // Skip noise lines
        if (shouldSkipLine(line)) {
            console.log('[Parser] Skipping noise:', line);
            continue;
        }

        // Check if this line starts with a date
        const dateMatch = isDateLine(line);
        if (dateMatch) {
            // Close previous block
            if (currentBlock) {
                blocks.push(currentBlock);
                console.log('[Parser] ✅ Closed block on new date:', currentBlock);
            }

            // Start new block
            const day = parseInt(dateMatch[1], 10);
            const monthStr = dateMatch[2].toLowerCase();
            const month = MONTH_MAP[monthStr];

            if (month && day >= 1 && day <= 31) {
                currentBlock = {
                    dateDay: day,
                    dateMonth: month,
                    descriptionLines: [],
                    value: null,
                    installment: null
                };

                // Apply pending merchant from previous lines
                if (pendingMerchant) {
                    currentBlock.descriptionLines.push(pendingMerchant);
                    console.log('[Parser] Using pending merchant:', pendingMerchant);
                    pendingMerchant = null; // Consume buffer
                }

                // Check if there's more content on the same line after the date
                const afterDate = line.substring(dateMatch[0].length).trim();
                if (afterDate) {
                    // Check for value on same line
                    const valueOnLine = extractValue(afterDate);

                    if (valueOnLine !== null && currentBlock.value === null) {
                        currentBlock.value = valueOnLine;
                        // Extract description (everything before R$)
                        const descPart = afterDate.replace(/R\$.*$/i, '').trim();
                        if (descPart && descPart.length > 2) {
                            currentBlock.descriptionLines.push(descPart);
                        }
                    } else {
                        // No value, so it's description
                        currentBlock.descriptionLines.push(afterDate);
                    }

                    // Check for installment anywhere
                    const inst = extractInstallment(afterDate);
                    if (inst && !currentBlock.installment) {
                        currentBlock.installment = inst;
                    }
                }
                console.log('[Parser] Started new block for:', dateMatch[0]);
            }
            continue;
        }

        // Not a date line

        // Check for installment pattern FIRST (including bare "2/2")
        const inst = extractInstallment(line);
        // Special check for bare "X/Y" which might not be caught by strict valid text check
        const isBareInstallment = /^(?:parcela\s*)?\d{1,2}\s*[/]\s*\d{1,2}\s*$/i.test(line.trim());

        if (currentBlock) {
            // Check for value (only take the FIRST R$ found)
            const value = extractValue(line);

            if (value !== null && currentBlock.value === null) {
                currentBlock.value = value;
                // Extract description part before value
                const descPart = line.replace(/R\$.*$/i, '').trim();
                if (descPart && descPart.length > 2) {
                    currentBlock.descriptionLines.push(descPart);
                }
                console.log('[Parser] Found value:', value);
            } else if (inst) {
                // It is an installment line
                if (!currentBlock.installment) {
                    currentBlock.installment = inst;
                    console.log('[Parser] Found installment:', inst);
                }
            } else if (!isBareInstallment) {
                // It's a text line (potential description)

                // Sanitize
                const cleanLine = line
                    .replace(/R\$.*$/i, '')
                    .replace(/(?:parcela\s*)?\d{1,2}\s*[/]\s*\d{1,2}/gi, '')
                    .replace(/\s*[-–]\s*parcela\s*$/i, '')
                    .replace(/[-–]\s*$/, '')
                    .trim();

                if (cleanLine.length > 2) {
                    // CRITICAL LOGIC:
                    // If current block *already has a value*, then this text line likely belongs to the NEXT block (pendingMerchant)
                    // unless it looks like it belongs here. 
                    // But in "offset" pattern, text appearing after value is usually next merchant.

                    if (currentBlock.value !== null) {
                        pendingMerchant = cleanLine;
                        console.log('[Parser] Found text after value -> Pending Merchant:', pendingMerchant);
                    } else {
                        currentBlock.descriptionLines.push(cleanLine);
                    }
                }
            }
        } else {
            // No active block - check if it's a pending merchant
            if (!inst && !isBareInstallment) {
                const isValue = extractValue(line) !== null;
                const isJustNumber = /^\d+$/.test(line.trim());

                if (!isValue && !isJustNumber && line.length > 3) {
                    // Clean up
                    const cleanLine = line
                        .replace(/\s*[-–]\s*parcela\s*$/i, '')
                        .replace(/[-–]\s*$/, '')
                        .trim();

                    if (cleanLine.length > 3) {
                        pendingMerchant = cleanLine;
                        console.log('[Parser] Stored pending merchant (no block):', pendingMerchant);
                    }
                }
            }
        }
    }

    // Don't forget the last block
    if (currentBlock) {
        blocks.push(currentBlock);
        console.log('[Parser] ✅ Closed final block:', currentBlock);
    }

    // Filter blocks that have a value (required for valid transaction)
    const validBlocks = blocks.filter(b => b.value !== null);
    console.log('[Parser] Valid blocks with value:', validBlocks.length);

    // Convert blocks to ParsedLine
    const parsedLines: ParsedLine[] = validBlocks.map(block => {
        // Choose the best description from the block's description lines
        // Strategy: prefer the FIRST valid line, fallback to longest if needed
        let firstValidDesc = '';
        let longestDesc = '';

        for (const line of block.descriptionLines) {
            const cleanLine = line
                .replace(/\s*[-–]\s*parcela\s*$/i, '')  // Remove "- Parcela" suffix
                .replace(/[-–]\s*$/, '')  // Remove trailing dash
                .replace(/\s+/g, ' ')
                .trim();

            // Skip if line is just numbers or very short
            if (!cleanLine || cleanLine.length < 3) continue;
            if (/^\d+$/.test(cleanLine)) continue;

            // Skip if line is just an installment pattern
            if (/^(?:parcela\s*)?\d{1,2}\s*[/]\s*\d{1,2}\s*$/i.test(cleanLine)) continue;

            // First valid description wins
            if (!firstValidDesc) {
                firstValidDesc = cleanLine;
            }

            // Track longest as fallback
            if (cleanLine.length > longestDesc.length) {
                longestDesc = cleanLine;
            }
        }

        // Prefer first valid, fallback to longest
        const bestDescription = firstValidDesc || longestDesc;

        const description = bestDescription || '';
        const year = inferYear(statementMonthLabel, block.dateMonth);
        const isPayment = /pagamento\s+recebido/i.test(description);

        return {
            posted_day: block.dateDay,
            posted_month: block.dateMonth,
            posted_year: year,
            description_raw: description || 'Descrição não identificada',
            amount_brl: block.value!,
            is_installment: block.installment !== null,
            installment_current: block.installment?.current,
            installment_total: block.installment?.total,
            installment_label_raw: block.installment?.raw,
            entry_type: isPayment ? 'PAYMENT_OR_CREDIT' : 'CHARGE',
            confidence: description ? 0.85 : 0.5  // Lower confidence if no description
        };
    });

    // Get existing transactions for deduplication CHECK (not removal)
    const existingTransactions = await db.realtimeTransactions
        .where('statement_month_label')
        .equals(statementMonthLabel)
        .and(t => t.source === source)
        .toArray();

    const existingKeys = new Set(existingTransactions.map(t => t.dedupe_key));

    // Convert to RealtimeTransaction - mark duplicates instead of removing
    const transactions: RealtimeTransaction[] = [];
    let newCount = 0;
    let possibleDuplicateCount = 0;

    for (const parsed of parsedLines) {
        const descNorm = normalizeDescription(parsed.description_raw);

        // --- AUTO CLASSIFICATION ---
        // Create a partial transaction to feed the classifier
        const partialTx: Partial<Transaction> = {
            descricaoOriginal: descNorm, // Classifier expects normalized merchant here or handles it internally
            valor: parsed.amount_brl,
        };

        // Await classification (it checks DB rules)
        const classified = await classifyTransaction(partialTx);

        const dedupeKey = generateDedupeKey(
            statementMonthLabel,
            parsed.posted_day,
            parsed.posted_month,
            parsed.posted_year,
            descNorm,
            parsed.amount_brl,
            parsed.installment_current,
            parsed.installment_total
        );

        // Check if this MIGHT be a duplicate (same key exists)
        const isPossibleDuplicate = existingKeys.has(dedupeKey);
        if (isPossibleDuplicate) {
            possibleDuplicateCount++;
        } else {
            newCount++;
        }

        // Add to existing keys for this upload session
        existingKeys.add(dedupeKey);

        const tx: RealtimeTransaction = {
            snapshot_id: snapshotId,
            source,
            statement_month_label: statementMonthLabel,
            uploaded_at: uploadedAt,
            posted_day: parsed.posted_day,
            posted_month: parsed.posted_month,
            posted_year: parsed.posted_year,
            description_raw: parsed.description_raw,
            description_normalized: descNorm,
            amount_brl: parsed.amount_brl,
            is_installment: parsed.is_installment,
            installment_current: parsed.installment_current,
            installment_total: parsed.installment_total,
            installment_label_raw: parsed.installment_label_raw,

            // Classification result
            entry_type: parsed.entry_type,
            suggested_category: classified.categoriaMacro,
            suggested_subcategory: classified.categoriaSub,
            categorization_confidence: classified.confiancaClassificacao || parsed.confidence,

            dedupe_key: dedupeKey,
            confidence: parsed.confidence,
            flags: isPossibleDuplicate ? ['POSSIBLE_DUPLICATE'] : []
        };

        transactions.push(tx);
    }

    console.log('[Parser] ✅ Result:', { total: transactions.length, newCount, possibleDuplicateCount });

    return {
        snapshot_id: snapshotId,
        statement_month_label: statementMonthLabel,
        transactions,
        new_count: newCount,
        duplicate_count: possibleDuplicateCount  // Now represents "possible" duplicates
    };
}

/**
 * Save parsed transactions to the database.
 */
export async function saveNubankParseResult(result: ParseResult, fileName?: string): Promise<void> {
    await db.realtimeSnapshots.add({
        id: result.snapshot_id,
        source: 'NUBANK_PRINT',
        statement_month_label: result.statement_month_label,
        uploaded_at: Date.now(),
        file_name: fileName,
        transactions_count: result.transactions.length + result.duplicate_count,
        new_transactions_count: result.new_count
    });

    if (result.transactions.length > 0) {
        await db.realtimeTransactions.bulkAdd(result.transactions);
    }
}

/**
 * Delete a snapshot and its associated transactions.
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
    await db.realtimeTransactions.where('snapshot_id').equals(snapshotId).delete();
    await db.realtimeSnapshots.delete(snapshotId);
}
