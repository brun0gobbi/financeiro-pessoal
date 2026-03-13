import Dexie, { type EntityTable } from 'dexie';

// ============== TYPES ==============

export type TransactionOrigin = 'NUBANK' | 'XP' | 'ITAU';
export type TransactionType = 'CREDITO' | 'DEBITO' | 'TRANSFERENCIA';
export type ReviewStatus = 'PENDENTE' | 'OK';
export type CostCenter = 'BRUNO' | 'MARINA' | 'CASA';

export interface Transaction {
    id?: number;
    importId?: number; // Link to ImportLog
    hash: string; // SHA256 of key fields for deduplication
    origem: TransactionOrigin;
    tipo: TransactionType;
    dataEvento: Date;
    mesCompetencia: string; // YYYY-MM
    descricaoOriginal: string;
    observacao?: string; // Descrição humana/detalhes

    // Classification Fields
    merchantNormalized?: string; // NUBANK -> "NUBANK", UBER *TRIP -> "UBER"
    categoriaMacro?: string; // ID da categoria (ex: "moradia")
    categoriaSub?: string;   // ID da subcategoria (ex: "aluguel")
    centro?: CostCenter;
    isAutoClassified?: boolean; // Se foi classificado automaticamente

    valor: number;
    moeda: string;

    recorrente: boolean;
    parcelado: boolean;
    idCompraParcelada?: string;
    parcelaNum?: number;
    parcelaTotal?: number;
    confiancaClassificacao: number; // 0-100
    statusRevisao: ReviewStatus;
    tags?: string[]; // V2: Behavioral tags (e.g. #funcional, #social)
    createdAt: Date;
    updatedAt: Date;
}

export interface MerchantMapping {
    id?: number;
    originalPattern: string; // Merchant normalizado ou padrão regex
    categoryId: string;
    subcategoryId: string;
    confidence: number;
    mapType: 'EXACT' | 'FUZZY';
    useCount: number; // Para saber quais regras são mais usadas
    lastUsedAt: Date;
}

export interface Category {
    id: string; // ID fixo (slug)
    label: string;
    iconName?: string;
    color?: string;
    subcategories?: { id: string; label: string }[];
}

export interface CategorizationRule {
    id?: number;
    nome: string;
    keywords: string[]; // Palavras-chave (OR)
    origens?: TransactionOrigin[];
    categoriaMacro: string;
    categoriaSub?: string;
    centro?: CostCenter;
    prioridade: number; // Higher = takes precedence
    ativa: boolean;
}

export interface MonthlyClosing {
    id?: number;
    mesCompetencia: string; // YYYY-MM
    fechadoEm?: Date;
    observacoes?: string;
    totalReceitas: number;
    totalDespesas: number;
}

export interface ImportLog {
    id?: number;
    fileName: string;
    fileHash: string;
    origem: TransactionOrigin;
    importedAt: Date;
    transactionsCount: number;
}

// ============== REAL-TIME / TEMPO REAL ==============

export type RealtimeSource = 'NUBANK_PRINT' | 'XP_PRINT' | 'ITAU_OFX_PARTIAL';
export type RealtimeEntryType = 'CHARGE' | 'PAYMENT_OR_CREDIT';

export interface RealtimeTransaction {
    id?: number;

    // Snapshot identification
    snapshot_id: string;
    source: RealtimeSource;
    statement_month_label: string; // "Fevereiro de 2026"
    uploaded_at: number;

    // Transaction data
    posted_day: number;
    posted_month: number;
    posted_year: number | null;
    description_raw: string;
    description_normalized: string;
    amount_brl: number; // Positive = debit, Negative = credit

    // Installments
    is_installment: boolean;
    installment_current?: number;
    installment_total?: number;
    installment_label_raw?: string;

    // Classification
    entry_type: RealtimeEntryType;
    suggested_category?: string;
    suggested_subcategory?: string;
    categorization_confidence?: number;

    // Deduplication
    dedupe_key: string;
    flags?: string[]; // ['POSSIBLE_DUPLICATE', 'LOW_CONFIDENCE', etc.]
    confidence: number; // 0-1
}

export interface RealtimeSnapshot {
    id: string; // UUID
    source: RealtimeSource;
    statement_month_label: string;
    uploaded_at: number;
    file_name?: string;
    transactions_count: number;
    new_transactions_count: number;
}

// ============== DATABASE ==============

export class FinanceDatabase extends Dexie {
    transactions!: EntityTable<Transaction, 'id'>;
    merchantMappings!: EntityTable<MerchantMapping, 'id'>;
    rules!: EntityTable<CategorizationRule, 'id'>;
    closings!: EntityTable<MonthlyClosing, 'id'>;
    importLogs!: EntityTable<ImportLog, 'id'>;
    realtimeTransactions!: EntityTable<RealtimeTransaction, 'id'>;
    realtimeSnapshots!: EntityTable<RealtimeSnapshot, 'id'>;

    constructor() {
        super('FinanceiroPessoal');

        this.version(5).stores({
            transactions: '++id, importId, hash, origem, mesCompetencia, statusRevisao, categoriaMacro, centro, dataEvento, merchantNormalized, *tags',
            merchantMappings: '++id, &originalPattern, categoryId',
            rules: '++id, nome, prioridade, ativa',
            closings: '++id, &mesCompetencia',
            importLogs: '++id, fileHash, origem, importedAt',
            realtimeTransactions: '++id, snapshot_id, source, statement_month_label, dedupe_key, uploaded_at',
            realtimeSnapshots: 'id, source, statement_month_label, uploaded_at',
        });
    }
}

export const db = new FinanceDatabase();

// ============== SEED DATA ==============

// Categories are now defined in constants, not DB seeded
export async function seedDefaultCategories() {
    // Deprecated - logic moved to constants
}

// Initialize on first load
seedDefaultCategories();

