
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
    const filePath = path.join(process.cwd(), 'faturas_teste', 'Nu - Dezembro.pdf');

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        return;
    }

    console.log('Reading file:', filePath);
    const buffer = fs.readFileSync(filePath);
    const data = new Uint8Array(buffer);

    // Loading PDF
    const loadingTask = pdfjsLib.getDocument({
        data,
        useSystemFonts: true,
        verbosity: 0
    });

    try {
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        console.log('\n--- PARSING ---');
        const result = parseNubank(fullText);
        console.log(`Found ${result.length} clean transactions.`);

        if (result.length > 0) {
            console.table(result);
        } else {
            console.log('No transactions found.');
        }

    } catch (error) {
        console.error('Error parsing PDF:', error);
    }
}

function parseNubank(text) {
    const transactions = [];
    const pattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+R\$\s*([\d.,]+)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
        let [_, day, monthStr, desc, valueStr] = match;

        desc = desc.trim();
        const upperDesc = desc.toUpperCase();

        // --- STRICT FILTERS ---
        if (desc.includes('Pagamento em')) continue;
        if (upperDesc.includes('RESUMO DA FATURA')) continue;
        if (upperDesc.includes('TOTAL DA FATURA')) continue;
        if (upperDesc.includes('VENCIMENTO')) continue;
        if (upperDesc.includes('SALDO ANTERIOR')) continue;
        if (upperDesc.includes('EMISSÃO E ENVIO')) continue;
        if (upperDesc.includes('PERÍODO VIGENTE')) continue;
        if (upperDesc.includes('LIMITE')) continue;
        if (/^\d{4}/.test(desc)) continue; // Starts with Year (e.g. 2025 ...)

        // Installment detection
        const installment = detectInstallment(desc);

        transactions.push({
            date: `${day} ${monthStr}`,
            description: desc,
            value: valueStr,
            parcela: installment ? `${installment.current}/${installment.total}` : ''
        });
    }
    return transactions;
}

function detectInstallment(description) {
    // Matches (01/10) or 01/10 or - 01/10
    const match = description.match(/(\d{1,2})\/(\d{1,2})/);
    if (match) {
        return {
            current: parseInt(match[1]),
            total: parseInt(match[2])
        };
    }
    return null;
}

run();
