/**
 * Standalone Nubank PDF Parser Test Script
 * Tests the parsing logic locally before deploying to browser
 * 
 * Usage: node scripts/test-nubank.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import pdfjs-dist ESM build
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to test PDF
const PDF_PATH = path.join(__dirname, '../faturas_teste/Nu - Dezembro.pdf');

// Expected values for validation
const EXPECTED_COUNT = 71;
const EXPECTED_SUM = 4630.46;

async function main() {
    console.log('='.repeat(60));
    console.log('NUBANK PDF PARSER TEST');
    console.log('='.repeat(60));
    console.log(`PDF: ${PDF_PATH}\n`);

    // Check if file exists
    if (!fs.existsSync(PDF_PATH)) {
        console.error(`❌ File not found: ${PDF_PATH}`);
        console.log('Please adjust the PDF_PATH variable.');
        process.exit(1);
    }

    // Load PDF
    const data = new Uint8Array(fs.readFileSync(PDF_PATH));
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    console.log(`Total pages: ${pdf.numPages}\n`);

    // Extract text page by page with line-aware extraction
    const pages = [];
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Group items by their Y position to detect lines
        let lastY = null;
        let lines = [];
        let currentLine = [];

        for (const item of content.items) {
            if (!('str' in item) || !item.str.trim()) continue;

            const y = item.transform ? item.transform[5] : null;

            // If Y changed significantly, it's a new line
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
                if (currentLine.length > 0) {
                    lines.push(currentLine.join(' '));
                    currentLine = [];
                }
            }

            currentLine.push(item.str);
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

    // Detect invoice year
    const invoiceYear = detectInvoiceYear(fullText);
    console.log(`Invoice Year Detected: ${invoiceYear}\n`);

    // DEBUG: Find potential credit lines (contain minus or negative patterns)
    console.log('=== LOOKING FOR X CORP ===');
    for (const page of pages) {
        for (let i = 0; i < page.lines.length; i++) {
            const line = page.lines[i];
            if (line.toLowerCase().includes('x corp') && !line.includes('IOF')) {
                console.log(`[Page ${page.pageNum}, Line ${i}]`);
                console.log(`  RAW: "${line}"`);
                console.log(`  Includes R$: ${line.includes('R$')}`);
                console.log(`  Length: ${line.length}`);
                // Test the pattern
                const linePattern = /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+.+?\s+(\d{4})\s+(.+)$/i;
                const matchResult = line.match(linePattern);
                console.log(`  Pattern match: ${matchResult ? 'YES' : 'NO'}`);
                if (matchResult) {
                    console.log(`  Groups: day=${matchResult[1]}, month=${matchResult[2]}, card=${matchResult[3]}, desc=${matchResult[4]}`);
                }
            }
        }
    }
    console.log('=== END SEARCH ===\n');

    // Parse transactions using page-by-page approach
    const transactions = parseNubank(pages, invoiceYear);

    // Output results
    console.log('\n' + '='.repeat(60));
    console.log('ALL TRANSACTIONS');
    console.log('='.repeat(60));

    transactions.forEach((tx, idx) => {
        const sign = tx.valor < 0 ? '' : '+';
        console.log(`${String(idx + 1).padStart(2)}. ${tx.data} | ${sign}R$ ${tx.valor.toFixed(2).padStart(8)} | ${tx.descricao.substring(0, 50)}`);
    });

    // Validation
    const totalValue = transactions.reduce((sum, tx) => sum + tx.valor, 0);

    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION');
    console.log('='.repeat(60));
    console.log(`Total transactions: ${transactions.length} (expected: ${EXPECTED_COUNT})`);
    console.log(`Sum of values: R$ ${totalValue.toFixed(2)} (expected: R$ ${EXPECTED_SUM})`);

    const countOK = transactions.length === EXPECTED_COUNT;
    const sumOK = Math.abs(totalValue - EXPECTED_SUM) < 0.01;

    console.log(`\nCount match: ${countOK ? '✅' : '❌'}`);
    console.log(`Sum match: ${sumOK ? '✅' : '❌'}`);

    if (!countOK || !sumOK) {
        console.log('\n⚠️ Parser needs adjustment!');
        if (!countOK) {
            console.log(`   Missing ${EXPECTED_COUNT - transactions.length} transactions`);
        }
        if (!sumOK) {
            console.log(`   Sum difference: R$ ${Math.abs(totalValue - EXPECTED_SUM).toFixed(2)}`);
        }
    } else {
        console.log('\n🎉 Parser is working correctly!');
    }
}

function detectInvoiceYear(text) {
    // Look for "vencimento: 10 DEZ 2025"
    const dueDateMatch = text.match(/vencimento[:\s]+\d{1,2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
    if (dueDateMatch) {
        return parseInt(dueDateMatch[2]);
    }

    // Look for "FATURA 10 DEZ 2025"
    const faturaMatch = text.match(/FATURA\s+\d{1,2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
    if (faturaMatch) {
        return parseInt(faturaMatch[2]);
    }

    // Fallback
    const now = new Date();
    return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
}

function parseNubank(pages, year) {
    const transactions = [];
    const filtered = [];

    // Pattern 1: DD MMM ... R$ VALUE (positive)
    const pattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+R\$\s*([\d.,]+)/gi;

    // Pattern 2: DD MMM ... −R$ VALUE (negative, uses special minus "−" character)
    const negPattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+[−-]R\$\s*([\d.,]+)/gi;

    const monthMap = {
        JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5,
        JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11
    };

    console.log('PROCESSING PAGES:');

    for (const page of pages) {
        let match;
        let pageCount = 0;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(page.text)) !== null) {
            const [fullMatch, day, monthStr, desc, valueStr] = match;
            const trimmedDesc = desc.trim();
            const upperDesc = trimmedDesc.toUpperCase();

            // MINIMAL filtering - only obvious non-transactions
            let skipReason = null;

            if (upperDesc.includes('PAGAMENTO EM')) skipReason = 'PAGAMENTO EM';
            else if (upperDesc.includes('TOTAL DA FATURA')) skipReason = 'TOTAL DA FATURA';
            else if (upperDesc.includes('RESUMO')) skipReason = 'RESUMO';
            else if (upperDesc.includes('SALDO RESTANTE')) skipReason = 'SALDO RESTANTE';
            else if (upperDesc.includes('ALTERNATIVAS DE PAGAMENTO')) skipReason = 'ALTERNATIVAS';
            else if (upperDesc.includes('PAGAMENTO TOTAL')) skipReason = 'PAGAMENTO TOTAL';
            else if (upperDesc.includes('LIMITE')) skipReason = 'LIMITE';
            else if (upperDesc.includes('PERÍODO VIGENTE')) skipReason = 'PERÍODO VIGENTE';
            else if (upperDesc.includes('EMISSÃO E ENVIO')) skipReason = 'EMISSÃO E ENVIO';
            else if (upperDesc.includes('ALTERNATIVAS')) skipReason = 'ALTERNATIVAS';
            else if (/\bA\s+\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/i.test(trimmedDesc)) skipReason = 'DATE RANGE';

            // NEW: Skip cardholder total lines (just names without card indicator)
            // These are lines like "Bruno Rogerio Gobbi" that are subtotals per cardholder
            // Real transactions have card indicator (•••• NNNN)
            const words = trimmedDesc.split(' ');
            const isJustName = words.length <= 4 &&
                words.every(w => /^[A-Za-zÀ-ú']+$/.test(w)) &&
                !trimmedDesc.includes('•') &&
                !trimmedDesc.includes('*');
            if (isJustName) skipReason = 'CARDHOLDER TOTAL';

            // NEW: Skip lines where description contains another date (cross-reference lines)
            // e.g. "11 NOV Cap Socio Furacao D" matched from a different context
            // BUT: Keep lines that have card indicator (•••• NNNN) - those are real transactions
            const hasCardIndicator = /[•*]{3,}\s*\d{4}/.test(trimmedDesc);
            if (/^\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/i.test(trimmedDesc) && !hasCardIndicator) {
                skipReason = 'EMBEDDED DATE (no card)';
            }

            if (skipReason) {
                filtered.push({ match: fullMatch.substring(0, 60), reason: skipReason });
                continue;
            }

            const month = monthMap[monthStr.toUpperCase()];
            let txDate = new Date(year, month, parseInt(day));

            // FIX: If description starts with embedded date (DD MMM), extract it and use as the real date
            const embeddedDateMatch = trimmedDesc.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/i);
            if (embeddedDateMatch) {
                const embDay = parseInt(embeddedDateMatch[1]);
                const embMonth = monthMap[embeddedDateMatch[2].toUpperCase()];
                txDate = new Date(year, embMonth, embDay);
            }

            let value = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));

            // Detect credits
            const isCredit = /estorno|devolução|crédito/i.test(trimmedDesc);
            if (isCredit) {
                value = -Math.abs(value);
            }

            // Clean description
            const cleanDesc = trimmedDesc.replace(/[•*]+\s*\d{4}\s*/g, '').trim();

            transactions.push({
                data: txDate.toLocaleDateString('pt-BR'),
                descricao: cleanDesc || trimmedDesc,
                valor: value,
                page: page.pageNum,
                raw: fullMatch.substring(0, 80)
            });

            pageCount++;
        }

        // SECOND PASS: Process negative values with −R$ pattern
        negPattern.lastIndex = 0;
        while ((match = negPattern.exec(page.text)) !== null) {
            const [fullMatch, day, monthStr, desc, valueStr] = match;
            const trimmedDesc = desc.trim();
            const upperDesc = trimmedDesc.toUpperCase();

            // Skip duplicates and obvious non-transactions
            if (upperDesc.includes('PAGAMENTO EM')) continue;
            if (upperDesc.includes('TOTAL DA FATURA')) continue;
            if (upperDesc.includes('LIMITE')) continue;

            const month = monthMap[monthStr.toUpperCase()];
            let txDate = new Date(year, month, parseInt(day));

            // Extract embedded date if present
            const embeddedDateMatch = trimmedDesc.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/i);
            if (embeddedDateMatch) {
                const embDay = parseInt(embeddedDateMatch[1]);
                const embMonth = monthMap[embeddedDateMatch[2].toUpperCase()];
                txDate = new Date(year, embMonth, embDay);
            }

            // FORCE NEGATIVE value since this is from negPattern
            let value = -Math.abs(parseFloat(valueStr.replace(/\./g, '').replace(',', '.')));

            // Clean description
            const cleanDesc = trimmedDesc.replace(/[•*]+\s*\d{4}\s*/g, '').trim();

            transactions.push({
                data: txDate.toLocaleDateString('pt-BR'),
                descricao: cleanDesc || trimmedDesc,
                valor: value,
                page: page.pageNum,
                raw: fullMatch.substring(0, 80),
                credit: true
            });

            pageCount++;
            console.log(`  [CREDIT FOUND] ${cleanDesc} -> -R$ ${Math.abs(value).toFixed(2)}`);
        }

        // THIRD PASS: Line-by-line for multi-line transactions (USD transactions)
        // These have format: "DD MMM •••• NNNN Description" on one line
        // Then USD conversion info on next lines, and R$ value on a separate line
        // Use flexible pattern - card indicator may be •••• or ???? or similar
        const linePattern = /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+.+?\s+(\d{4})\s+(.+)$/i;

        for (let i = 0; i < page.lines.length; i++) {
            const line = page.lines[i];
            const lineMatch = line.match(linePattern);

            if (lineMatch && !line.includes('R$')) {
                // This line has date + card + description but NO value
                // Look ahead for value in next few lines
                const [, day, monthStr, cardNum, desc] = lineMatch;

                // Search next 5 lines for R$ value
                let foundValue = null;
                for (let j = i + 1; j < Math.min(i + 6, page.lines.length); j++) {
                    const nextLine = page.lines[j];
                    const valueMatch = nextLine.match(/^R\$\s*([\d.,]+)$/);
                    if (valueMatch) {
                        foundValue = parseFloat(valueMatch[1].replace(/\./g, '').replace(',', '.'));
                        break;
                    }
                    // Stop if we hit another transaction line
                    if (/^\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/.test(nextLine)) {
                        break;
                    }
                }

                if (foundValue) {
                    const month = monthMap[monthStr.toUpperCase()];
                    const txDate = new Date(year, month, parseInt(day));
                    const dateStr = txDate.toLocaleDateString('pt-BR');

                    // Check if we already have this exact transaction (same date + same value)
                    const descClean = desc.trim();
                    const isDuplicate = transactions.some(t =>
                        t.data === dateStr && Math.abs(t.valor - foundValue) < 0.01
                    );

                    if (!isDuplicate) {
                        transactions.push({
                            data: txDate.toLocaleDateString('pt-BR'),
                            descricao: descClean,
                            valor: foundValue,
                            page: page.pageNum,
                            raw: line.substring(0, 80)
                        });
                        pageCount++;
                        console.log(`  [MULTI-LINE TX] ${descClean} -> R$ ${foundValue.toFixed(2)}`);
                    }
                }
            }
        }

        console.log(`  Page ${page.pageNum}: ${pageCount} transactions`);
    }

    // Show filtered items
    console.log('\n--- FILTERED ITEMS ---');
    filtered.forEach(f => console.log(`  [${f.reason}] ${f.match}`));

    return transactions;
}

main().catch(console.error);
