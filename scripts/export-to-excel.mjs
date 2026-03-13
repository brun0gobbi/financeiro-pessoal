/**
 * Export Nubank transactions to Excel for comparison
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PDF_PATH = path.join(__dirname, '../faturas_teste/Nu - Dezembro.pdf');
const OUTPUT_PATH = path.join(__dirname, '../faturas_teste/transacoes_nubank.xlsx');

async function main() {
    console.log('Parsing PDF...');

    const data = new Uint8Array(fs.readFileSync(PDF_PATH));
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    const pages = [];
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        let lastY = null;
        let lines = [];
        let currentLine = [];

        for (const item of content.items) {
            if (!('str' in item) || !item.str.trim()) continue;
            const y = item.transform ? item.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
                if (currentLine.length > 0) {
                    lines.push(currentLine.join(' '));
                    currentLine = [];
                }
            }
            currentLine.push(item.str);
            lastY = y;
        }
        if (currentLine.length > 0) lines.push(currentLine.join(' '));

        const pageText = lines.join('\n');
        pages.push({ pageNum: i, text: pageText, lines: lines });
        fullText += pageText + '\n\n';
    }

    // Detect year
    const yearMatch = fullText.match(/vencimento[:\s]+\d{1,2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
    const year = yearMatch ? parseInt(yearMatch[2]) : 2025;

    // Parse transactions
    const transactions = parseNubank(pages, year);

    // Create Excel file
    const wsData = [
        ['#', 'Data', 'Cartão', 'Descrição', 'Valor', 'Página']
    ];

    transactions.forEach((tx, idx) => {
        wsData.push([
            idx + 1,
            tx.data,
            tx.cartao || '',
            tx.descricao,
            tx.valor,
            tx.page
        ]);
    });

    // Add summary row
    const total = transactions.reduce((sum, tx) => sum + tx.valor, 0);
    wsData.push([]);
    wsData.push(['', '', '', 'TOTAL:', total, '']);
    wsData.push(['', '', '', 'Transações:', transactions.length, '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transações');

    XLSX.writeFile(wb, OUTPUT_PATH);
    console.log(`\n✅ Excel saved to: ${OUTPUT_PATH}`);
    console.log(`Total transactions: ${transactions.length}`);
    console.log(`Total value: R$ ${total.toFixed(2)}`);
}

function parseNubank(pages, year) {
    const transactions = [];

    const pattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+R\$\s*([\d.,]+)/gi;
    const negPattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+[−-]R\$\s*([\d.,]+)/gi;

    const monthMap = { JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5, JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11 };

    for (const page of pages) {
        let match;
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
            if (upperDesc.includes('LIMITE')) continue;
            if (upperDesc.includes('PERÍODO VIGENTE')) continue;
            if (upperDesc.includes('EMISSÃO E ENVIO')) continue;
            if (upperDesc.includes('ALTERNATIVAS')) continue;
            if (/\bA\s+\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/i.test(trimmedDesc)) continue;

            // Skip cardholder totals
            const words = trimmedDesc.split(' ');
            const isJustName = words.length <= 4 && words.every(w => /^[A-Za-zÀ-ú']+$/.test(w)) && !trimmedDesc.includes('•') && !trimmedDesc.includes('*');
            if (isJustName) continue;

            // Extract card number if present
            const cardMatch = trimmedDesc.match(/[•*]+\s*(\d{4})/);
            const cardNumber = cardMatch ? cardMatch[1] : '';

            // Get date
            const month = monthMap[monthStr.toUpperCase()];
            let txDate = new Date(year, month, parseInt(day));

            const embeddedDateMatch = trimmedDesc.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+/i);
            if (embeddedDateMatch) {
                txDate = new Date(year, monthMap[embeddedDateMatch[2].toUpperCase()], parseInt(embeddedDateMatch[1]));
            }

            let value = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));
            const cleanDesc = trimmedDesc.replace(/[•*]+\s*\d{4}\s*/g, '').trim();

            transactions.push({
                data: txDate.toLocaleDateString('pt-BR'),
                cartao: cardNumber,
                descricao: cleanDesc || trimmedDesc,
                valor: value,
                page: page.pageNum
            });
        }

        // Negative values
        negPattern.lastIndex = 0;
        while ((match = negPattern.exec(page.text)) !== null) {
            const [, day, monthStr, desc, valueStr] = match;
            const trimmedDesc = desc.trim();
            const upperDesc = trimmedDesc.toUpperCase();

            if (upperDesc.includes('PAGAMENTO EM')) continue;
            if (upperDesc.includes('LIMITE')) continue;

            const cardMatch = trimmedDesc.match(/[•*]+\s*(\d{4})/);
            const cardNumber = cardMatch ? cardMatch[1] : '';

            const month = monthMap[monthStr.toUpperCase()];
            let txDate = new Date(year, month, parseInt(day));

            let value = -Math.abs(parseFloat(valueStr.replace(/\./g, '').replace(',', '.')));
            const cleanDesc = trimmedDesc.replace(/[•*]+\s*\d{4}\s*/g, '').trim();

            transactions.push({
                data: txDate.toLocaleDateString('pt-BR'),
                cartao: cardNumber,
                descricao: cleanDesc,
                valor: value,
                page: page.pageNum
            });
        }
    }

    return transactions;
}

main().catch(console.error);
