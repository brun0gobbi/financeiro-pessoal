import { db } from '../../db/schema';
import type { Transaction } from '../../db/schema';
import { CATEGORIES } from '../../constants/categories';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const BATCH_SIZE = 20;

interface ClassificationResult {
    id: number;
    categoriaMacro: string;
    categoriaSub: string;
}

async function getFlashModel(apiKey: string): Promise<string> {
    const res = await fetch(`${GEMINI_BASE}/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`Erro ao listar modelos: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const models: { name: string }[] = data.models || [];
    const flash = models.find((m) => m.name.toLowerCase().includes('flash'));
    if (!flash) throw new Error('Nenhum modelo "flash" encontrado na sua conta.');
    // model.name is like "models/gemini-2.0-flash" — extract the last segment
    return flash.name.replace(/^models\//, '');
}

function buildCategoryList(): string {
    return CATEGORIES.map((cat) => {
        const subs = cat.subcategories?.map((s) => `    - ${s.id}: ${s.label}`).join('\n') || '';
        return `- ${cat.id}: ${cat.label}\n${subs}`;
    }).join('\n');
}

function buildPrompt(transactions: Transaction[]): string {
    const categoryList = buildCategoryList();
    const txList = transactions
        .map((t) => `{"id":${t.id},"desc":"${t.descricaoOriginal.replace(/"/g, '')}","valor":${t.valor},"tipo":"${t.tipo}"}`)
        .join('\n');

    return `Você é um classificador financeiro pessoal brasileiro. Classifique cada transação abaixo de acordo com as categorias e subcategorias disponíveis.

CATEGORIAS DISPONÍVEIS:
${categoryList}

TRANSAÇÕES PARA CLASSIFICAR:
${txList}

REGRAS:
- Responda APENAS com JSON válido, sem markdown, sem explicações.
- Para cada transação, forneça: id (número), categoriaMacro (id da categoria), categoriaSub (id da subcategoria ou "" se não houver).
- Escolha a categoria mais adequada com base na descrição e tipo.
- Se for CREDITO, considere categorias de renda (renda, fluxos_sociais, investimentos).
- Se não conseguir identificar, use "nao_identificado" com subcategoria "nao_sei".

FORMATO DA RESPOSTA (apenas JSON):
{"results":[{"id":1,"categoriaMacro":"transporte","categoriaSub":"uber"},{"id":2,"categoriaMacro":"alimentacao","categoriaSub":"delivery_funcional"}]}`;
}

async function classifyBatch(
    apiKey: string,
    model: string,
    transactions: Transaction[]
): Promise<ClassificationResult[]> {
    const prompt = buildPrompt(transactions);

    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Erro na API Gemini: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(clean);
    return parsed.results as ClassificationResult[];
}

export interface ClassifyProgress {
    processed: number;
    total: number;
    model: string;
}

export async function classifyWithGemini(
    transactions: Transaction[],
    onProgress: (p: ClassifyProgress) => void
): Promise<{ classified: number; errors: number }> {
    const apiKeyRecord = await db.appSettings.get('googleApiKey');
    if (!apiKeyRecord?.value) {
        throw new Error('Google AI API Key não configurada. Configure em Configurações > IA.');
    }
    const apiKey = apiKeyRecord.value;

    const model = await getFlashModel(apiKey);
    let processed = 0;
    let errors = 0;

    onProgress({ processed: 0, total: transactions.length, model });

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        try {
            const results = await classifyBatch(apiKey, model, batch);
            await db.transaction('rw', db.transactions, async () => {
                for (const r of results) {
                    await db.transactions.update(r.id, {
                        categoriaMacro: r.categoriaMacro,
                        categoriaSub: r.categoriaSub || undefined,
                        statusRevisao: 'OK',
                        confiancaClassificacao: 85,
                        isAutoClassified: true,
                        updatedAt: new Date(),
                    });
                }
            });
        } catch (err) {
            console.error(`Erro no lote ${i / BATCH_SIZE + 1}:`, err);
            errors += batch.length;
        }

        processed = Math.min(i + BATCH_SIZE, transactions.length);
        onProgress({ processed, total: transactions.length, model });
    }

    return { classified: processed - errors, errors };
}
