import { db } from '../../db/schema';

export async function exportData() {
    const transactions = await db.transactions.toArray();

    // Future proofing: if we have more tables, add them here
    const data = {
        version: 1,
        timestamp: Date.now(),
        transactions
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return true;
}
