
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

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
        console.log(`PDF loaded. Pages: ${pdf.numPages}`);

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        console.log('--- EXTRACTED TEXT START ---');
        console.log(fullText.slice(0, 500) + '... [truncated] ...');
        console.log('--- EXTRACTED TEXT END ---');

        // Run Parser
        console.log('\n--- PARSING ---');
        const result = parseNubank(fullText);
        console.log('Detected Origin:', detectOrigin(fullText));
        console.log(`Found ${result.length} transactions.`);

        // Print all transactions for user to verify
        if (result.length > 0) {
            console.table(result);
        } else {
            console.log('No transactions found. Check Regex.');
        }

    } catch (error) {
        console.error('Error parsing PDF:', error);
    }
}

// --- LOGIC FROM processor.ts (Modified for CLI) ---

function detectOrigin(text) {
    const lower = text.toLowerCase();
    if (lower.includes('nubank')) return 'NUBANK';
    if (lower.includes('xp') || lower.includes('visa')) return 'XP';
    if (lower.includes('itau') || lower.includes('extrato')) return 'ITAU';
    return 'UNKNOWN';
}

function parseNubank(text) {
    const transactions = [];

    // Regex tuning based on typical Nubank PDF
    // Usually: DATE (DD MMM) - DESCRIPTION - VALUE
    // OR: DD MMM Description R$ 100,00

    // Based on user info:
    // "12 DEZ Uber *Uber *Trip Rio De Janeiro Br R$ 24,90"

    const pattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+R\$\s*([\d.,]+)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
        let [_, day, monthStr, desc, valueStr] = match;

        desc = desc.trim();

        // Exclude common noise lines if any
        if (desc.includes('Pagamento em')) continue;

        transactions.push({
            date: `${day} ${monthStr}`,
            description: desc,
            value: valueStr
        });
    }
    return transactions;
}

run();
