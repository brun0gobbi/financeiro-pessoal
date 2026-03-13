import { extractItauTransactions } from '../src/services/pdf/itauAdapter';
import { readFile } from 'fs/promises';
import path from 'path';

const PDF_PATH = String.raw`C:\Users\bruno.gobbi\.gemini\antigravity\scratch\financeiro-pessoal\faturas_teste\Itau - Conta Corrente -Extrato Mensal_Novembro2025.pdf`;

async function test() {
    try {
        console.log(`Testing Adapter with: ${PDF_PATH}`);
        const buffer = await readFile(PDF_PATH);

        // Mock File object (Node.js doesn't have File globals by default, but we can pass a Blob-like or modify the adapter to accept Buffer for testing, 
        // OR just mock the arrayBuffer method which is what the adapter calls)
        const fileMock = {
            arrayBuffer: async () => buffer.buffer
        } as unknown as File;

        const transactions = await extractItauTransactions(fileMock);

        console.log(`\nFound ${transactions.length} transactions.\n`);

        transactions.forEach((t, i) => {
            console.log(`[${i + 1}] ${t.dataEvento.toLocaleDateString()} | ${t.descricaoOriginal.padEnd(40)} | R$ ${t.valor.toFixed(2)} (${t.tipo})`);
        });

    } catch (error) {
        console.error('Error running test:', error);
    }
}

test();
