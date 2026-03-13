
import { db } from '../../db/schema';

/**
 * V2 Migration Strategy (Strict & Behavioral)
 * 
 * CORE PRINCIPLES:
 * 1. Eliminate 'alimentacao_lazer'.
 * 2. Split into 'alimentacao' (Functional) vs 'lazer_social' (Experience).
 * 3. Apply Tagging System: Intent (funcional, social, prazer, habito) + Context (rotina, evento).
 * 4. Move DANIELLE/RJL to 'fluxos_sociais'.
 */

export const migrateV2Categories = async () => {
    console.log('Starting V2 Strict Migration...');
    const transactions = await db.transactions.toArray();
    let updatedCount = 0;

    const updates: Promise<any>[] = [];

    for (const t of transactions) {
        let needsUpdate = false;
        let newCat = t.categoriaMacro;
        let newSub = t.categoriaSub;
        let newTags = new Set(t.tags || []);

        const desc = t.descricaoOriginal.toUpperCase();

        // --- RULE 1: FLUXOS SOCIAIS (High Priority) ---
        if (desc.includes('DANIELLE') || desc.includes('RJL') || desc.includes('REPASSE')) {
            newCat = 'fluxos_sociais';
            // Determine IN or OUT
            newSub = t.valor < 0 ? 'saida_neutra' : 'entrada_neutra';
            needsUpdate = true;
        }

        // --- RULE 2: SPECIFIC MERCHANT RULES (Overrides everything) ---
        else if (desc.includes('VILLA CASE')) {
            newCat = 'alimentacao';
            newSub = 'alimentacao_funcional';
            newTags.add('funcional');
            newTags.add('rotina');
            needsUpdate = true;
        }
        else if (desc.includes('99FOOD') || desc.includes('IFOO') || desc.includes('UBER EATS')) {
            newCat = 'alimentacao';
            newSub = 'delivery_funcional';
            newTags.add('funcional'); // User said functional or habito_automatico
            needsUpdate = true;
        }
        else if (desc.includes('GILMAR')) {
            newCat = 'lazer_social';
            newSub = 'bares_cafes_social';
            newTags.add('social');
            newTags.add('prazer_real');
            needsUpdate = true;
        }
        else if (desc.includes('WAB PUB') || desc.includes('FESTA') || desc.includes('ANIVERSARIO')) {
            newCat = 'lazer_social';
            newSub = 'eventos_datas';
            newTags.add('evento');
            newTags.add('prazer_real');
            if (Math.abs(t.valor) > 150) newTags.add('alto_valor');
            needsUpdate = true;
        }
        else if (desc.includes('CAP') && (desc.includes('SOCIO') || desc.includes('FURACAO') || desc.includes('INGRESSO'))) {
            newCat = 'lazer_social';
            newSub = 'futebol';
            newTags.add('prazer_real');
            newTags.add('rotina'); // Socio is routine
            needsUpdate = true;
        }

        // --- RULE 3: MIGRATING OLD 'ALIMENTACAO_LAZER' (Generic Fallback) ---
        else if (t.categoriaMacro === 'alimentacao_lazer') {
            needsUpdate = true;

            // Map old subcategories to new structure
            switch (t.categoriaSub) {
                // Funcional
                case 'almoco_trabalho':
                    newCat = 'alimentacao';
                    newSub = 'alimentacao_funcional';
                    newTags.add('funcional');
                    newTags.add('rotina');
                    break;
                case 'delivery':
                    newCat = 'alimentacao';
                    newSub = 'delivery_funcional';
                    newTags.add('funcional');
                    break;

                // Social / Lazer
                case 'restaurantes':
                    // Ambiguous: defaulting to Lazer & Social, but adding tag to review
                    newCat = 'lazer_social';
                    newSub = 'bares_cafes_social'; // or restaurantes
                    newTags.add('social');
                    newTags.add('migracao_pendente');
                    break;
                case 'bares':
                    newCat = 'lazer_social';
                    newSub = 'bares_cafes_social';
                    newTags.add('social');
                    newTags.add('prazer_real');
                    break;
                case 'cinema':
                    newCat = 'lazer_social';
                    newSub = 'cinema_shows';
                    newTags.add('prazer_real');
                    newTags.add('experiencia');
                    break;
                case 'athletico':
                case 'futebol':
                    newCat = 'lazer_social';
                    newSub = 'futebol';
                    newTags.add('prazer_real');
                    newTags.add('esporte');
                    break;
                case 'eventos':
                    newCat = 'lazer_social';
                    newSub = 'eventos_datas';
                    newTags.add('evento');
                    break;

                default:
                    // Unknown old subcat
                    newCat = 'lazer_social';
                    newSub = 'lazer_geral';
                    newTags.add('migracao_pendente');
                    break;
            }
        }

        // --- RULE 4: TAGGING BASED ON VALUE (Heuristic) ---
        // If it's Lazer & Social and > 300, tag as #alto_valor
        if (newCat === 'lazer_social' && Math.abs(t.valor) > 300) {
            newTags.add('alto_valor');
            needsUpdate = true;
        }

        if (needsUpdate) {
            updates.push(db.transactions.update(t.id!, {
                categoriaMacro: newCat,
                categoriaSub: newSub,
                tags: Array.from(newTags)
            }));
            updatedCount++;
        }
    }

    await Promise.all(updates);
    console.log(`V2 Strict Migration Complete. Updated ${updatedCount} transactions.`);
    return updatedCount;
};
