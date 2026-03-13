import type { Category } from '../db/schema';

export const CATEGORIES: Category[] = [
    {
        id: 'moradia',
        label: 'Moradia & Casa',
        iconName: 'Home',
        color: 'cat-moradia',
        subcategories: [
            { id: 'condominio', label: 'Condomínio' },
            { id: 'aluguel', label: 'Aluguel/Financiamento' },
            { id: 'contas', label: 'Energia/Água/Gás' },
            { id: 'internet', label: 'Internet/Telefone' },
            { id: 'manutencao', label: 'Manutenção/Reparos' },
            { id: 'itens_casa', label: 'Itens para casa' },
        ]
    },
    {
        id: 'mercado',
        label: 'Mercado & Dia a Dia',
        iconName: 'ShoppingCart',
        color: 'cat-mercado',
        subcategories: [
            { id: 'supermercado', label: 'Supermercado' },
            { id: 'hortifruti', label: 'Hortifruti' },
            { id: 'padaria', label: 'Padaria' },
            { id: 'acougue', label: 'Açougue' },
            { id: 'limpeza', label: 'Produtos de limpeza' },
            { id: 'higiene', label: 'Farmácia (Higiene)' },
        ]
    },
    {
        id: 'alimentacao',
        label: 'Alimentação',
        iconName: 'Utensils',
        color: 'cat-alimentacao',
        subcategories: [
            { id: 'alimentacao_funcional', label: 'Alimentação funcional' },
            { id: 'cafes_lanches_funcionais', label: 'Cafés & lanches funcionais' },
            { id: 'delivery_funcional', label: 'Delivery funcional' },
        ]
    },
    {
        id: 'lazer_social',
        label: 'Lazer & Social',
        iconName: 'PartyPopper',
        color: 'cat-lazer',
        subcategories: [
            { id: 'bares_cafes_social', label: 'Bares & Cafés (social)' },
            { id: 'eventos_datas', label: 'Eventos & Datas especiais' },
            { id: 'futebol', label: 'Futebol / Athletico' },
            { id: 'cinema_shows', label: 'Cinema & Shows' },
            { id: 'lazer_geral', label: 'Lazer geral' },
        ]
    },
    {
        id: 'transporte',
        label: 'Transporte',
        iconName: 'Car',
        color: 'cat-transporte',
        subcategories: [
            { id: 'uber', label: 'Uber/99' },
            { id: 'combustivel', label: 'Combustível' },
            { id: 'estacionamento', label: 'Estacionamento/Pedágio' },
            { id: 'manutencao_carro', label: 'Manutenção/Seguro' },
            { id: 'transporte_publico', label: 'Transporte público' },
            { id: 'viagem_curta', label: 'Viagens curtas' },
        ]
    },
    {
        id: 'saude',
        label: 'Saúde',
        iconName: 'Heart',
        color: 'cat-saude',
        subcategories: [
            { id: 'farmacia', label: 'Farmácia (Remédios)' },
            { id: 'consultas', label: 'Consultas/Exames' },
            { id: 'plano_saude', label: 'Plano de saúde' },
            { id: 'academia', label: 'Academia' },
            { id: 'terapia', label: 'Terapia' },
            { id: 'suplementos', label: 'Suplementos' },
        ]
    },
    {
        id: 'assinaturas',
        label: 'Assinaturas & Serviços',
        iconName: 'Tv',
        color: 'cat-assinaturas',
        subcategories: [
            { id: 'streaming', label: 'Streaming (Netflix, etc)' },
            { id: 'musica', label: 'Música (Spotify, etc)' },
            { id: 'apps', label: 'Apps/Softwares' },
            { id: 'news', label: 'Clubs/News' },
            { id: 'servicos_online', label: 'Serviços Online' },
        ]
    },
    {
        id: 'compras',
        label: 'Compras (Pessoal/Online)',
        iconName: 'Package',
        color: 'cat-compras',
        subcategories: [
            { id: 'roupas', label: 'Roupas/Calçados' },
            { id: 'eletronicos', label: 'Eletrônicos' },
            { id: 'marketplace', label: 'Amazon/Mercado Livre' },
            { id: 'presentes', label: 'Presentes' },
            { id: 'beleza', label: 'Beleza/Estética' },
        ]
    },
    {
        id: 'viagens',
        label: 'Viagens',
        iconName: 'Plane',
        color: 'cat-viagens',
        subcategories: [
            { id: 'passagens', label: 'Passagens' },
            { id: 'hospedagem', label: 'Hospedagem' },
            { id: 'alimentacao_viagem', label: 'Alimentaão em viagem' },
            { id: 'passeios', label: 'Passeios' },
            { id: 'transporte_viagem', label: 'Transporte em viagem' },
        ]
    },
    {
        id: 'financeiro',
        label: 'Financeiro & Taxas',
        iconName: 'Receipt',
        color: 'cat-impostos',
        subcategories: [
            { id: 'iof', label: 'IOF' },
            { id: 'tarifas', label: 'Tarifas bancárias' },
            { id: 'juros', label: 'Juros/Multas' },
            { id: 'anuidades', label: 'Anuidades' },
            { id: 'impostos', label: 'Impostos pessoais' },
        ]
    },
    {
        id: 'investimentos',
        label: 'Investimentos',
        iconName: 'TrendingUp',
        color: 'cat-investimentos',
        subcategories: [
            { id: 'aporte', label: 'Aporte/Aplicação' },
            { id: 'previdencia', label: 'Previdência' },
            { id: 'reserva', label: 'Reserva/Caixinha' },
            { id: 'cripto', label: 'Cripto' },
        ]
    },
    {
        id: 'pets',
        label: 'Pets',
        iconName: 'Dog',
        color: 'cat-pets',
        subcategories: [
            { id: 'racao', label: 'Ração/Pet shop' },
            { id: 'veterinario', label: 'Veterinário' },
            { id: 'medicamentos_pet', label: 'Medicamentos' },
            { id: 'banho', label: 'Banho/Tosa' },
        ]
    },
    {
        id: 'educacao',
        label: 'Educação',
        iconName: 'Book',
        color: 'cat-educacao',
        subcategories: [
            { id: 'cursos', label: 'Cursos' },
            { id: 'livros', label: 'Livros' },
            { id: 'assinaturas_educ', label: 'Assinaturas educacionais' },
            { id: 'certificacoes', label: 'Eventos/Certificações' },
        ]
    },
    {
        id: 'marilice',
        label: 'Marilice',
        iconName: 'User',
        color: 'cat-marilice',
        subcategories: [
            { id: 'luz_marilice', label: 'Luz' },
            { id: 'internet_marilice', label: 'Internet/Telefonia' },
            { id: 'condominio_marilice', label: 'Condomínio' },
            { id: 'plano_saude_marilice', label: 'Plano de Saúde' },
            { id: 'ajuda_mensal_marilice', label: 'Ajuda Mensal' },
            { id: 'ajuda_nao_previstas_marilice', label: 'Ajuda não previstas' },
            { id: 'gas_marilice', label: 'Gás' },
            { id: 'iptu_marilice', label: 'IPTU' },
        ]
    },
    {
        id: 'cartao_casal',
        label: 'Cartão de Crédito - Casal',
        iconName: 'CreditCard',
        color: 'cat-repasse',
        subcategories: [
            { id: 'fatura_casal', label: 'Pagamento Fatura' },
            { id: 'compras_casal', label: 'Compras Casal' },
        ]
    },
    {
        id: 'contas_casal',
        label: 'Contas da casa - Casal',
        iconName: 'Home',
        color: 'cat-moradia',
        subcategories: [
            { id: 'aluguel_casal', label: 'Aluguel/Condomínio' },
            { id: 'contas_consumo_casal', label: 'Luz/Água/Gás' },
            { id: 'internet_casal', label: 'Internet/TV' },
            { id: 'extra_casa_casal', label: 'Extras Casa' },
        ]
    }, {
        id: 'nao_identificado',
        label: 'Não Identificado / Outros',
        iconName: 'HelpCircle',
        color: 'cat-outros',
        subcategories: [
            { id: 'nao_sei', label: 'Não sei o que é' },
            { id: 'saque', label: 'Saque em dinheiro' },
            { id: 'ajuste', label: 'Ajuste de saldo' },
        ]
    },
    {
        id: 'renda',
        label: 'Renda & Receitas',
        iconName: 'Wallet',
        color: 'cat-renda',
        subcategories: [
            { id: 'salario', label: 'Salário' },
            { id: 'extra', label: 'Renda Extra / Freela' },
            { id: 'reembolso', label: 'Reembolso' },
            { id: 'proventos', label: 'Dividendos/Rendimentos' },
            { id: 'aulas_ce', label: 'Aulas - Centro Europeu' },
            { id: 'honorarios_indicacao', label: 'Honorários - Indicação' },
            { id: 'bonus_extra', label: 'Bônus Extraordinário' },
            { id: 'ajuda_custo', label: 'Ajuda de Custo' },
        ]
    },
    {
        id: 'fluxos_sociais',
        label: 'Fluxos Sociais',
        iconName: 'Repeat',
        color: 'cat-repasse',
        subcategories: [
            { id: 'entrada_neutra', label: 'Entrada Neutra (ex: Irmã)' },
            { id: 'saida_neutra', label: 'Saída Neutra (ex: Repasse Pessoais)' },
        ]
    },
    {
        id: 'pagamento_cartao',
        label: 'Pagamento de Cartão',
        iconName: 'CreditCard',
        color: 'cat-interno',
        subcategories: [
            { id: 'fatura_nubank', label: 'Fatura Nubank' },
            { id: 'fatura_xp', label: 'Fatura XP' },
            { id: 'fatura_outros', label: 'Outros Cartões' },
        ]
    },
    {
        id: 'interno',
        label: 'Movimentação Interna',
        iconName: 'ArrowLeftRight',
        color: 'cat-interno',
        subcategories: [
            { id: 'reserva', label: 'Reserva/Caixinha' },
            { id: 'fatura', label: 'Pagamento de Fatura' },
            { id: 'resgate', label: 'Resgate de Aplicação' },
        ]
    }
];

export const getCategoryLabel = (id?: string) => {
    if (!id) return '';
    const cat = CATEGORIES.find(c => c.id === id);
    return cat ? cat.label : id;
};

export const getSubcategoryLabel = (catId?: string, subId?: string) => {
    if (!catId || !subId) return '';
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat || !cat.subcategories) return subId;
    const sub = cat.subcategories.find(s => s.id === subId);
    return sub ? sub.label : subId;
};

export const TRANSACTIONS_CATEGORIES_MAP: Record<string, string[]> = CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = cat.subcategories ? cat.subcategories.map(s => s.id) : [];
    return acc;
}, {} as Record<string, string[]>);
