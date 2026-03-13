import { db } from '../../db/schema';
import type { Transaction, TransactionOrigin } from '../../db/schema';
import { generateTransactionHash, detectInstallment } from '../../lib/utils';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { classifyTransaction } from '../../services/classifier/engine';
import { extractItauTransactions } from '../pdf/itauAdapter';
import { extractOfxTransactions } from './ofxAdapter';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Summary returned after import
export interface ImportSummary {
    success: boolean;
    fileName: string;
    origem: TransactionOrigin;
    totalTransactions: number;
    addedTransactions: number;
    skippedFile: boolean;
    // Extracted from PDF header
    dueDate?: string;
    totalValue?: number;
    // First and last transactions
    firstTransaction?: { description: string; date: string; value: number };
    lastTransaction?: { description: string; date: string; value: number };
}

export async function processFiles(files: File[]): Promise<ImportSummary[]> {
    const summaries: ImportSummary[] = [];

    for (const file of files) {
        try {
            let origin: TransactionOrigin | null = detectOrigin(file.name);

            // AUTO-DETECT OFX as ITAU
            if (file.name.toLowerCase().endsWith('.ofx')) {
                origin = 'ITAU';
            }

            if (!origin) {
                console.warn(`Unknown file format: ${file.name}`);
                summaries.push({
                    success: false,
                    fileName: file.name,
                    origem: 'UNKNOWN' as TransactionOrigin,
                    totalTransactions: 0,
                    addedTransactions: 0,
                    skippedFile: true,
                });
                continue;
            }

            // Check if already imported (by file hash)
            const fileHash = await hashFile(file);
            const existing = await db.importLogs.where('fileHash').equals(fileHash).first();
            if (existing) {
                console.log(`File already imported: ${file.name}`);
                summaries.push({
                    success: false,
                    fileName: file.name,
                    origem: origin,
                    totalTransactions: 0,
                    addedTransactions: 0,
                    skippedFile: true,
                });
                continue;
            }

            let rawTransactions: (Omit<Transaction, 'id' | 'hash' | 'createdAt' | 'updatedAt' | 'importId'> & { hash?: string })[] = [];
            let headerInfo: { dueDate?: string; totalValue?: number } = {};

            // === BRANCH: OFX vs PDF ===
            if (file.name.toLowerCase().endsWith('.ofx')) {
                console.log(`Processing OFX file: ${file.name}`);
                rawTransactions = await extractOfxTransactions(file);
            } else {
                // Extract PDF data
                console.log(`Extracting pages from ${file.name}...`);
                const pdfData = await extractPdfData(file);
                headerInfo = extractHeaderInfo(pdfData.fullText, origin);

                switch (origin) {
                    case 'NUBANK': rawTransactions = parseNubank(pdfData); break;
                    case 'XP': rawTransactions = parseXP(pdfData.fullText); break;
                    case 'ITAU': rawTransactions = await extractItauTransactions(pdfData); break;
                }
            }

            console.log(`Found ${rawTransactions.length} transactions.`);

            // Create Import Log first to get ID
            const importLogId = await db.importLogs.add({
                fileName: file.name,
                fileHash,
                origem: origin,
                importedAt: new Date(),
                transactionsCount: 0, // Will update later
            });

            let addedCount = 0;
            for (const tx of rawTransactions) {
                // Apply automatic classification
                const classifiedTx = await classifyTransaction(tx);

                const hash = tx.hash || await generateTransactionHash(
                    tx.origem,
                    tx.dataEvento.toISOString(),
                    tx.descricaoOriginal + '-' + addedCount,
                    tx.valor
                );

                await db.transactions.add({
                    ...classifiedTx,
                    hash,
                    importId: importLogId as number,
                    centro: classifiedTx.centro || 'BRUNO', // Default to BRUNO
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as Transaction);

                addedCount++;
            }
            console.log(`Imported ${addedCount} transactions`);

            // Update Import Log with real count
            await db.importLogs.update(importLogId, { transactionsCount: addedCount });

            // Build summary
            const first = rawTransactions[0];
            const last = rawTransactions[rawTransactions.length - 1];

            summaries.push({
                success: true,
                fileName: file.name,
                origem: origin,
                totalTransactions: rawTransactions.length,
                addedTransactions: addedCount,
                skippedFile: false,
                dueDate: headerInfo.dueDate,
                totalValue: headerInfo.totalValue,
                firstTransaction: first ? {
                    description: first.descricaoOriginal,
                    date: first.dataEvento.toLocaleDateString('pt-BR'),
                    value: first.valor,
                } : undefined,
                lastTransaction: last ? {
                    description: last.descricaoOriginal,
                    date: last.dataEvento.toLocaleDateString('pt-BR'),
                    value: last.valor,
                } : undefined,
            });

            console.log(`Imported ${addedCount} transactions from ${file.name}`);
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            throw error;
        }
    }

    return summaries;
}

// Extract due date and total value from PDF header
function extractHeaderInfo(text: string, origin: TransactionOrigin): { dueDate?: string; totalValue?: number } {
    if (origin === 'NUBANK') {
        // Due date: "vencimento: DD MMM" or "Data de vencimento: DD MMM YYYY"
        const dueDateMatch = text.match(/vencimento[:\s]+(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*(\d{4})?/i);
        // Total: "valor de R$ X.XXX,XX" or "R$ X.XXX,XX" near beginning
        const totalMatch = text.match(/valor\s+(?:de\s+)?R\$\s*([\d.,]+)/i);

        return {
            dueDate: dueDateMatch ? `${dueDateMatch[1]} ${dueDateMatch[2].toUpperCase()} ${dueDateMatch[3] || new Date().getFullYear()}` : undefined,
            totalValue: totalMatch ? parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.')) : undefined,
        };
    }
    return {};
}

function detectOrigin(fileName: string): TransactionOrigin | null {
    const lower = fileName.toLowerCase();
    if (lower.includes('nubank') || lower.includes('nu ') || lower.startsWith('nu-') || lower.startsWith('nu_')) return 'NUBANK';
    if (lower.includes('xp') || lower.includes('visa')) return 'XP';
    if (lower.includes('itau') || lower.includes('extrato')) return 'ITAU';
    // Fallback: prompt user or use heuristics
    if (lower.includes('fatura')) return 'NUBANK'; // common case
    return null;
}

async function hashFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// PDF extraction result with page-by-page breakdown including lines array
export interface PdfExtractResult {
    pages: { pageNum: number; text: string; lines: string[] }[];
    fullText: string;
    invoiceYear: number;
    invoiceMonth: number;
    totalPages: number;
}

async function extractPdfData(file: File): Promise<PdfExtractResult> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        useSystemFonts: true
    }).promise;

    const pages: { pageNum: number; text: string; lines: string[] }[] = [];
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Group items by Y position to detect line breaks
        let lastY: number | null = null;
        const lines: string[] = [];
        let currentLine: string[] = [];

        for (const item of content.items) {
            if (!('str' in item) || !(item as { str: string }).str.trim()) continue;

            const textItem = item as { str: string; transform?: number[] };
            const y = textItem.transform ? textItem.transform[5] : null;

            // If Y changed significantly, it's a new line
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
                if (currentLine.length > 0) {
                    lines.push(currentLine.join(' '));
                    currentLine = [];
                }
            }

            currentLine.push(textItem.str);
            lastY = y;
        }

        // Don't forget the last line
        if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
        }

        const pageText = lines.join('\n');
        pages.push({ pageNum: i, text: pageText, lines: lines });
        fullText += pageText + '\n\n';
    }

    // Detect invoice date from first pages (header area)
    const invoiceDate = detectInvoiceDate(fullText);

    return {
        pages,
        fullText,
        invoiceYear: invoiceDate.getFullYear(),
        invoiceMonth: invoiceDate.getMonth(), // 0-based
        totalPages: pdf.numPages
    };
}

// Detect invoice date (month/year) from header text
function detectInvoiceDate(text: string): Date {
    const monthMap: Record<string, number> = {
        JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5,
        JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11
    };

    // Priority 1: "vencimento: 10 DEZ 2025"
    const dueDateMatch = text.match(/vencimento[:\s]+\d{1,2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
    if (dueDateMatch) {
        console.log('Invoice date from due date:', dueDateMatch[1], dueDateMatch[2]);
        return new Date(parseInt(dueDateMatch[2]), monthMap[dueDateMatch[1].toUpperCase()], 1);
    }

    // Priority 2: "FATURA 10 DEZ 2025"
    const faturaMatch = text.match(/FATURA\s+\d{1,2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
    if (faturaMatch) {
        console.log('Invoice date from FATURA:', faturaMatch[1], faturaMatch[2]);
        return new Date(parseInt(faturaMatch[2]), monthMap[faturaMatch[1].toUpperCase()], 1);
    }

    // Fallback
    console.warn('Could not detect invoice date, using current date');
    return new Date();
}

// ============== NUBANK PARSER ==============
// Complete parser with: positive pattern, negative pattern, multi-line transactions
function parseNubank(pdfData: PdfExtractResult): Omit<Transaction, 'id' | 'hash' | 'createdAt' | 'updatedAt'>[] {
    const transactions: Omit<Transaction, 'id' | 'hash' | 'createdAt' | 'updatedAt'>[] = [];

    const year = pdfData.invoiceYear;
    console.log('=== NUBANK PARSER (PAGE-BASED) ===');
    console.log('Invoice Year:', year);
    console.log('Total Pages:', pdfData.totalPages);

    // Pattern 1: DD MMM ... R$ VALUE (positive)
    const pattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+R\$\s*([\d.,]+)/gi;

    // Pattern 2: DD MMM ... −R$ VALUE (negative - uses special minus "−" character)
    const negPattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+[−-]R\$\s*([\d.,]+)/gi;

    // Month mapping
    const monthMap: Record<string, number> = {
        JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5,
        JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11
    };

    // Process each page
    for (const page of pdfData.pages) {
        console.log(`Processing page ${page.pageNum}...`);
        let match;
        let pageTransactions = 0;

        // === FIRST PASS: Positive values (R$) ===
        pattern.lastIndex = 0;
        while ((match = pattern.exec(page.text)) !== null) {
            const [, day, monthStr, desc, valueStr] = match;
            const trimmedDesc = desc.trim();
            const upperDesc = trimmedDesc.toUpperCase();

            // Skip non-transactions
            if (upperDesc.includes('PAGAMENTO EM')) continue;
            if (upperDesc.includes('TOTAL DA FATURA')) continue;
            if (upperDesc.includes('RESUMO')) continue;
            if (upperDesc.includes('SALDO RESTANTE')) continue;
            if (upperDesc.includes('ALTERNATIVAS')) continue;
            if (upperDesc.includes('PAGAMENTO TOTAL')) continue;
            if (upperDesc.includes('LIMITE')) continue;
            if (upperDesc.includes('PERÍODO VIGENTE')) continue;
            if (upperDesc.includes('EMISSÃO E ENVIO')) continue;
            if (/\bA\s+\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/i.test(trimmedDesc)) continue;

            // Skip cardholder total lines (just names without card indicator)
            const words = trimmedDesc.split(' ');
            const isJustName = words.length <= 4 &&
                words.every(w => /^[A-Za-zÀ-ú']+$/.test(w)) &&
                !trimmedDesc.includes('•') &&
                !trimmedDesc.includes('*');
            if (isJustName) continue;

            // Get date - check for embedded date in description first
            const month = monthMap[monthStr.toUpperCase()];
            let txDate = new Date(year, month, parseInt(day));

            const embeddedDateMatch = trimmedDesc.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/i);
            if (embeddedDateMatch) {
                const embDay = parseInt(embeddedDateMatch[1]);
                const embMonth = monthMap[embeddedDateMatch[2].toUpperCase()];
                txDate = new Date(year, embMonth, embDay);
            }

            let value = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));

            // Detect credits by description
            const isCredit = /estorno|devolução|crédito/i.test(trimmedDesc);
            if (isCredit) {
                value = -Math.abs(value);
            }

            // Clean description
            const cleanDesc = trimmedDesc.replace(/[•*]+\s*\d{4}\s*/g, '').trim();
            const installment = detectInstallment(cleanDesc);

            transactions.push({
                origem: 'NUBANK',
                tipo: isCredit ? 'CREDITO' : 'DEBITO',
                dataEvento: txDate,
                mesCompetencia: `${year}-${String(pdfData.invoiceMonth + 1).padStart(2, '0')}`,
                descricaoOriginal: cleanDesc || trimmedDesc,
                valor: value,
                moeda: 'BRL',
                recorrente: false,
                parcelado: !!installment,
                parcelaNum: installment?.parcelaNum,
                parcelaTotal: installment?.parcelaTotal,
                confiancaClassificacao: 0,
                statusRevisao: 'PENDENTE',
            });
            pageTransactions++;
        }

        // === SECOND PASS: Negative values (−R$) ===
        negPattern.lastIndex = 0;
        while ((match = negPattern.exec(page.text)) !== null) {
            const [, day, monthStr, desc, valueStr] = match;
            const trimmedDesc = desc.trim();
            const upperDesc = trimmedDesc.toUpperCase();

            if (upperDesc.includes('PAGAMENTO EM')) continue;
            if (upperDesc.includes('LIMITE')) continue;

            const month = monthMap[monthStr.toUpperCase()];
            let txDate = new Date(year, month, parseInt(day));
            const embeddedDateMatch = trimmedDesc.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/i);
            if (embeddedDateMatch) {
                txDate = new Date(year, monthMap[embeddedDateMatch[2].toUpperCase()], parseInt(embeddedDateMatch[1]));
            }

            const value = -Math.abs(parseFloat(valueStr.replace(/\./g, '').replace(',', '.')));
            const cleanDesc = trimmedDesc.replace(/[•*]+\s*\d{4}\s*/g, '').trim();
            const installment = detectInstallment(cleanDesc);

            transactions.push({
                origem: 'NUBANK',
                tipo: 'DEBITO', // Cartão de crédito é sempre despesa, créditos são abatimentos
                dataEvento: txDate,
                mesCompetencia: `${year}-${String(pdfData.invoiceMonth + 1).padStart(2, '0')}`,
                descricaoOriginal: cleanDesc,
                valor: value, // Valor já é negativo
                moeda: 'BRL',
                recorrente: false,
                parcelado: !!installment,
                parcelaNum: installment?.parcelaNum,
                parcelaTotal: installment?.parcelaTotal,
                confiancaClassificacao: 0,
                statusRevisao: 'PENDENTE',
            });
            pageTransactions++;
            console.log(`  [CREDIT] ${cleanDesc} -> R$ ${value.toFixed(2)}`);
        }

        // === THIRD PASS: Multi-line transactions (USD purchases) ===
        // These have format: "DD MMM •••• NNNN Description" on one line
        // Then conversion info on next lines, and R$ value on a separate line
        const linePattern = /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+.+?\s+(\d{4})\s+(.+)$/i;

        for (let i = 0; i < page.lines.length; i++) {
            const line = page.lines[i];
            const lineMatch = line.match(linePattern);

            if (lineMatch && !line.includes('R$')) {
                const [, day, monthStr, , desc] = lineMatch;

                // Search next 5 lines for R$ value
                let foundValue: number | null = null;
                for (let j = i + 1; j < Math.min(i + 6, page.lines.length); j++) {
                    const nextLine = page.lines[j];
                    const valueMatch = nextLine.match(/^R\$\s*([\d.,]+)$/);
                    if (valueMatch) {
                        foundValue = parseFloat(valueMatch[1].replace(/\./g, '').replace(',', '.'));
                        break;
                    }
                    if (/^\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/.test(nextLine)) break;
                }

                if (foundValue) {
                    const month = monthMap[monthStr.toUpperCase()];
                    const txDate = new Date(year, month, parseInt(day));
                    const dateStr = txDate.toLocaleDateString('pt-BR');

                    // Check for duplicates by date + value
                    const isDuplicate = transactions.some(t =>
                        t.dataEvento.toLocaleDateString('pt-BR') === dateStr && Math.abs(t.valor - foundValue!) < 0.01
                    );

                    if (!isDuplicate) {
                        const cleanDesc = desc.trim();
                        const installment = detectInstallment(cleanDesc);

                        transactions.push({
                            origem: 'NUBANK',
                            tipo: 'DEBITO',
                            dataEvento: txDate,
                            mesCompetencia: `${year}-${String(pdfData.invoiceMonth + 1).padStart(2, '0')}`,
                            descricaoOriginal: cleanDesc,
                            valor: foundValue,
                            moeda: 'BRL',
                            recorrente: false,
                            parcelado: !!installment,
                            parcelaNum: installment?.parcelaNum,
                            parcelaTotal: installment?.parcelaTotal,
                            confiancaClassificacao: 0,
                            statusRevisao: 'PENDENTE',
                        });
                        pageTransactions++;
                        console.log(`  [MULTI-LINE] ${cleanDesc} -> R$ ${foundValue.toFixed(2)}`);
                    }
                }
            }
        }

        console.log(`  -> Found ${pageTransactions} transactions on page ${page.pageNum}`);
    }

    // Log summary
    const totalValue = transactions.reduce((sum, t) => sum + t.valor, 0);
    console.log('=== PARSER SUMMARY ===');
    console.log(`Total transactions: ${transactions.length}`);
    console.log(`Sum of values: R$ ${totalValue.toFixed(2)}`);

    return transactions;
}

// ============== XP PARSER ==============
// XP format: DD/MM/YY DESCRIPTION VALOR_BRL [VALOR_USD]
// Examples:
//   22/08/25 LATAM AIR - Parcela 4/4 257,58 0,00
//   25/11/25 OPENAI *CHATGPT SUBSCR 114,36 20,00
//   25/11/25 IOF Transacoes Exterior R$ 4,00
function parseXP(text: string): Omit<Transaction, 'id' | 'hash' | 'createdAt' | 'updatedAt'>[] {
    const transactions: Omit<Transaction, 'id' | 'hash' | 'createdAt' | 'updatedAt'>[] = [];

    console.log('=== XP PARSER ===');

    // Detect invoice date from "Vencimento DD / MM / YYYY" pattern
    const vencMatch = text.match(/Vencimento\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i);
    let invoiceYear = new Date().getFullYear();
    let invoiceMonth = new Date().getMonth();

    if (vencMatch) {
        invoiceMonth = parseInt(vencMatch[2]) - 1; // 0-based
        invoiceYear = parseInt(vencMatch[3]);
        console.log(`XP Invoice: Vencimento ${vencMatch[1]}/${vencMatch[2]}/${vencMatch[3]}`);
    }

    // Split text into lines
    const lines = text.split('\n');

    for (let line of lines) {
        // NORMALIZE: Remove extra spaces around / and , (XP PDF extraction quirk)
        line = line.replace(/\s*\/\s*/g, '/').replace(/\s*,\s*/g, ',').replace(/\s*\.\s*/g, '.');

        // GATE RULE: Must start with date DD/MM/YY (after normalization)
        const dateMatch = line.match(/^\s*(\d{2})\/(\d{2})\/(\d{2})\s+/);
        if (!dateMatch) continue;

        const [, day, month, yearShort] = dateMatch;

        // Extract description and values from the rest of the line
        const afterDate = line.substring(dateMatch[0].length);

        // IGNORE: "Pagamentos Validos Normais"
        if (/Pagamentos?\s+V[aá]lidos?/i.test(afterDate)) {
            console.log(`  [SKIP] Payment: ${afterDate.substring(0, 40)}...`);
            continue;
        }

        // Find all monetary values at the end (pattern: ###,## or ###.###,##)
        const valueMatches = afterDate.match(/[\d.,]+\s*$/);
        if (!valueMatches) continue;

        // Split to handle both BRL and USD values
        const valuesStr = afterDate.match(/([\d.,]+)\s+([\d.,]+)\s*$/) || afterDate.match(/([\d.,]+)\s*$/);
        if (!valuesStr) continue;

        // Extract BRL value (first number if two, or only number)
        let valorBRL: number;
        let valorUSD: number | undefined;

        if (valuesStr[2]) {
            // Two values: BRL USD
            valorBRL = parseFloat(valuesStr[1].replace(/\./g, '').replace(',', '.'));
            valorUSD = parseFloat(valuesStr[2].replace(/\./g, '').replace(',', '.'));
        } else {
            // Single value: BRL only
            valorBRL = parseFloat(valuesStr[1].replace(/\./g, '').replace(',', '.'));
        }

        // Extract description (everything before the values)
        const descEnd = afterDate.lastIndexOf(valuesStr[0]);
        let desc = afterDate.substring(0, descEnd).trim();

        // Clean up description - remove trailing "R$" if present
        desc = desc.replace(/\s*R\s*\$\s*$/, '').trim();

        // Skip if description is empty or just numbers
        if (!desc || /^[\d\s.,]+$/.test(desc)) continue;

        // Skip header/subtotal lines
        if (/Subtotal|Total|Limite|Saldo/i.test(desc)) continue;

        // Parse year (25 -> 2025)
        const year = 2000 + parseInt(yearShort);
        const txDate = new Date(year, parseInt(month) - 1, parseInt(day));

        // Detect installment: "Parcela X/Y" or "X/Y" at end
        const installment = detectInstallment(desc);

        // Determine if IOF (unused for now)
        // const isIOF = /IOF\s+Transac/i.test(desc);

        console.log(`  [TX] ${day}/${month}/${yearShort} ${desc.substring(0, 30)}... R$ ${valorBRL.toFixed(2)}${valorUSD ? ` (US$ ${valorUSD})` : ''}${installment ? ` [${installment.parcelaNum}/${installment.parcelaTotal}]` : ''}`);

        transactions.push({
            origem: 'XP',
            tipo: 'DEBITO', // XP é cartão de crédito, sempre despesa
            dataEvento: txDate,
            mesCompetencia: `${invoiceYear}-${String(invoiceMonth + 1).padStart(2, '0')}`,
            descricaoOriginal: desc,
            valor: valorBRL,
            moeda: valorUSD ? 'USD' : 'BRL',
            recorrente: false,
            parcelado: !!installment,
            parcelaNum: installment?.parcelaNum,
            parcelaTotal: installment?.parcelaTotal,
            confiancaClassificacao: 0,
            statusRevisao: 'PENDENTE',
        });
    }

    // Log summary
    const totalValue = transactions.reduce((sum, t) => sum + t.valor, 0);
    console.log(`XP Parser: ${transactions.length} transactions, total R$ ${totalValue.toFixed(2)}`);

    return transactions;
}


