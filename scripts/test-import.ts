
import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Node.js specific setup for pdfjs-dist
// We need to polyfill some browser APIs or use the correct import for Node
// For simplicity in this test script, we try to use standard import and set worker
// Note: In a real node app we might need 'canvas' package for strict rendering, 
// but for text extraction it might pass.

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
    });

    try {
        const pdf = await loadingTask.promise;
        console.log(`PDF loaded. Pages: ${pdf.numPages}`);

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
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

        // Print first 5 and last 5
        if (result.length > 0) {
            console.log('\nFirst 5 transactions:');
            console.table(result.slice(0, 5));

            console.log('\nLast 5 transactions:');
            console.table(result.slice(-5));
        }

    } catch (error) {
        console.error('Error parsing PDF:', error);
    }
}

// --- LOGIC FROM processor.ts (Modified for CLI) ---

function detectOrigin(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('nubank')) return 'NUBANK';
    if (lower.includes('xp') || lower.includes('visa')) return 'XP';
    if (lower.includes('itau') || lower.includes('extrato')) return 'ITAU';
    return 'UNKNOWN';
}

function parseNubank(text: string) {
    const transactions = [];
    // Regex based on user feedback and general NuBank format
    // Date format usually: DD MMM
    // Description
    // Amount usually: 1.234,56 or 123,45

    // Attempting to match detailed line items
    // EX: 12 DEZ Uber *Uber *Trip Rio De Janeiro Br R$ 24,90
    // EX: 12 DEZ Iof (0,38%) R$ 0,09

    const pattern = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+([\d.,]+)/gi;

    // Simplified Year Assumption (User said invoice is Dec 2024? or just Dec?)
    // If competence is Nov, and due date Dec, usually purchases are from Nov.
    // For now, let's just parse what we see.

    let match;
    while ((match = pattern.exec(text)) !== null) {
        // Cleaning up
        let [_, day, monthStr, desc, valueStr] = match;

        // Sometimes description captures 'R$' at the end if strict formatting isn't perfect
        desc = desc.replace(/R\$\s*$/, '').trim();

        // Remove ' - ' or similar noise if regex caught it

        transactions.push({
            date: `${day} ${monthStr}`,
            description: desc,
            value: valueStr,
            raw: match[0]
        });
    }
    return transactions;
}

run();
