import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile, writeFile } from 'fs/promises';

const PDF_PATH = String.raw`C:\Users\bruno.gobbi\.gemini\antigravity\scratch\financeiro-pessoal\faturas_teste\Itau - Conta Corrente -Extrato Mensal_Novembro2025.pdf`;

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
    /movimenta/i
];

function isIgnored(line) {
    const normalize = line.trim().toLowerCase();
    if (!normalize) return true;
    // Check regex patterns
    return IGNORE_PATTERNS.some(pattern => pattern.test(normalize));
}

function parseDate(dateStr, currentYear) {
    // Expects "dd/mm"
    if (!/^\d{2}\/\d{2}$/.test(dateStr)) return null;
    const [day, month] = dateStr.split('/');
    return new Date(Number(currentYear), Number(month) - 1, Number(day));
}

function parseValue(valueStr) {
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

async function extractItauTransactions() {
    console.log(`Reading file from: ${PDF_PATH}`);
    const buffer = await readFile(PDF_PATH);
    const uint8Array = new Uint8Array(buffer);

    const loadingTask = getDocument({
        data: uint8Array,
        useSystemFonts: true,
    });

    const doc = await loadingTask.promise;
    const transactions = [];

    let currentYear = new Date().getFullYear().toString();
    const yearRegex = /^[a-z]{3}\s(20\d{2})$/i; // "nov 2025"

    // State Machine
    let lastDate = null;
    let pendingDescription = null;
    let skipNextValue = false;

    // Stop patterns - sections that come AFTER the real statement
    const STOP_PATTERNS = [
        /totalizador de aplica/i,
        /dbitos automticos efetuados/i, // "Débitos automáticos efetuados"
        /crdito pr-aprovado/i, // "Crédito pré-aprovado"
        /cheque especial/i,
        /pacote de servi/i
    ];

    // Patterns that indicate the NEXT value should be ignored (Balances, Sweeps)
    const VALUE_SKIP_PATTERNS = [
        /saldo anterior/i,
        /saldo final/i,
        /saldo em/i,
        /saldo aplic aut/i,
        /aplic aplic aut/i, // "Apl Aplic Aut"
        /res aplic aut/i,   // "Res Aplic Aut"
        /rend pago/i,       // "Rend Pago"
        /\(créditos\)/i,
        /\(débitos\)/i
    ];

    const allLines = [];

    outerLoop:
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const lines = content.items
            .map(item => item.str)
            .filter(str => str.trim().length > 0);

        for (let j = 0; j < lines.length; j++) {
            const line = lines[j].trim();
            allLines.push(line);

            // Check Stop Patterns
            if (STOP_PATTERNS.some(p => p.test(line))) {
                console.log('Stop Pattern detected:', line);
                break outerLoop; // Stop parsing entirely
            }

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
                    const tipo = value < 0 ? 'DEBITO' : 'CREDITO';

                    transactions.push({
                        dataEvento: lastDate,
                        descricaoOriginal: pendingDescription,
                        valor: value,
                        tipo
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

    // Dump all lines
    await writeFile('debug_lines.txt', allLines.join('\n'), 'utf-8');
    return transactions;
}

extractItauTransactions().then(async transactions => {
    let output = `Found ${transactions.length} transactions.\n\n`;
    let total = 0;
    transactions.forEach((t, i) => {
        output += `[${i + 1}] ${t.dataEvento.toLocaleDateString()} | ${t.descricaoOriginal.padEnd(40)} | R$ ${t.valor.toFixed(2)} (${t.tipo})\n`;
        total += t.valor;
    });
    output += `\nTotal Delta: R$ ${total.toFixed(2)}`;

    await writeFile('itau_parsed_transactions.txt', output, 'utf-8');
    console.log('Results written to itau_parsed_transactions.txt');
}).catch(console.error);
