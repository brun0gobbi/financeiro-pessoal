import { readFileSync } from 'fs';
import { parseOfxContent } from '../src/services/importer/ofxAdapter';
import path from 'path';

// Mock TransactionType and Schema interfaces since we can't import them easily in ts-node without full setup
// actually we can just rely on the js execution if we compile or use ts-node.
// For simplicity, I will copy the logic/file or just rely on relative imports if environment supports it.
// Given the environment, I'll try relative imports. If it fails, I'll mock.

const filePath = String.raw`C:\Users\bruno.gobbi\.gemini\antigravity\scratch\financeiro-pessoal\faturas_teste\Extrato Conta Corrente-130120262128.ofx`;

try {
    console.log(`Reading file: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');

    console.log('File read successfully. Parsing...');
    const transactions = parseOfxContent(content);

    console.log(`Parsed ${transactions.length} transactions.`);

    // Print a few samples to verify enrichment
    console.log('\n--- Sample Transactions ---');
    transactions.slice(0, 10).forEach((t, i) => {
        console.log(`[${i}] ${t.dataEvento.toISOString().split('T')[0]} | R$ ${t.valor.toFixed(2)} | ${t.descricaoOriginal} | Type: ${t.tipo}`);
    });

    console.log('\n--- Enrichment Checks ---');
    const pix = transactions.filter(t => t.descricaoOriginal.includes('PIX') || t.descricaoOriginal.includes('TRANSF'));
    console.log(`Pix/Transfers found: ${pix.length}`);
    if (pix.length > 0) console.log('Sample Pix:', pix[0].descricaoOriginal);

} catch (error) {
    console.error('Error importing:', error);
}
