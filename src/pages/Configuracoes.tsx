import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings as SettingsIcon, Plus, Trash2, Save, Tag, Users, FileText, Brain, RefreshCw, FolderSync, Key, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { relearnFromHistory } from '../services/classifier/engine';
import { migrateV2Categories } from '../services/migrations/v2_categories';
import { toast } from 'sonner';
import { db } from '../db/schema';
import type { CategorizationRule } from '../db/schema';
import { CATEGORIES } from '../constants/categories';
import { cn } from '../lib/utils';
import { useFileSystem } from '../hooks/useFileSystem';

type Tab = 'categories' | 'rules' | 'backup' | 'ia';

export function Configuracoes() {
    const [activeTab, setActiveTab] = useState<Tab>('categories');
    const rules = useLiveQuery(() => db.rules.orderBy('prioridade').reverse().toArray(), []);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent/20 flex items-center justify-center">
                    <SettingsIcon className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Configurações</h1>
                    <p className="text-text-secondary">Categorias, regras e backup</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/5 pb-2">
                {[
                    { id: 'categories', label: 'Categorias (Fixo)', icon: Tag },
                    { id: 'rules', label: 'Regras', icon: FileText },
                    { id: 'backup', label: 'Backup', icon: Users },
                    { id: 'ia', label: 'Inteligência Artificial', icon: Brain },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as Tab)}
                        className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors', activeTab === tab.id ? 'bg-primary-500 text-white' : 'text-text-secondary hover:bg-surface-700')}
                    >
                        <tab.icon className="w-4 h-4" /> {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'categories' && <CategoriesTab />}
            {activeTab === 'rules' && <RulesTab rules={rules || []} />}
            {activeTab === 'backup' && <BackupTab />}
            {activeTab === 'ia' && <IaTab />}
        </div>
    );
}

function CategoriesTab() {
    return (
        <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-text-primary">Categorias Disponíveis</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {CATEGORIES.map((c) => (
                    <div key={c.id} className="p-3 bg-surface-700 rounded-xl text-center flex flex-col items-center gap-2">
                        {/* Assuming icon handling could be improved later, just showing label now */}
                        <span className="text-sm font-medium text-text-primary">{c.label}</span>
                        <span className="text-[10px] text-text-secondary">{c.subcategories?.length || 0} subs</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RulesTab({ rules }: { rules: CategorizationRule[] }) {
    const [newRule, setNewRule] = useState({ nome: '', keywords: '', categoriaMacro: '', prioridade: 50 });

    const addRule = async () => {
        if (!newRule.nome || !newRule.keywords || !newRule.categoriaMacro) return;
        await db.rules.add({
            nome: newRule.nome,
            keywords: newRule.keywords.split(',').map((k) => k.trim().toLowerCase()),
            categoriaMacro: newRule.categoriaMacro,
            prioridade: newRule.prioridade,
            ativa: true,
        });
        setNewRule({ nome: '', keywords: '', categoriaMacro: '', prioridade: 50 });
    };

    const deleteRule = async (id: number) => { await db.rules.delete(id); };
    const toggleRule = async (id: number, ativa: boolean) => { await db.rules.update(id, { ativa: !ativa }); };

    return (
        <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-text-primary">Regras de Categorização</h3>
                    <p className="text-sm text-text-secondary">O sistema também aprende automaticamente com suas correções manuais.</p>
                </div>
            </div>

            {/* AI Learning Section */}
            <div className="card p-6 border-l-4 border-l-purple-500 bg-surface-700/30">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <Brain className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">Inteligência Artificial</h2>
                            <p className="text-sm text-text-secondary">Gerencie o aprendizado automático de categorias</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-4 bg-surface-50 dark:bg-surface-800 rounded-xl">
                    <div>
                        <h3 className="font-medium text-text-primary">Reaprender do Histórico</h3>
                        <p className="text-sm text-text-muted mt-1">
                            Analisa todas as transações já aprovadas e cria novas regras de classificação automática.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            const toastId = toast.loading('Analisando histórico...');
                            try {
                                const result = await relearnFromHistory();
                                toast.success(`Aprendizado concluído! ${result.learned} padrões identificados.`, {
                                    id: toastId,
                                    duration: 5000
                                });
                            } catch (error) {
                                console.error(error);
                                toast.error('Erro ao reaprender.', { id: toastId });
                            }
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Forçar Aprendizado
                    </button>
                </div>
            </div>

            {/* Add new rule */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 bg-surface-700/50 rounded-xl">
                <input type="text" placeholder="Nome da Regra" value={newRule.nome} onChange={(e) => setNewRule({ ...newRule, nome: e.target.value })} className="px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary" />
                <input type="text" placeholder="Palavras-chave (vírgula)" value={newRule.keywords} onChange={(e) => setNewRule({ ...newRule, keywords: e.target.value })} className="px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary" />
                <select value={newRule.categoriaMacro} onChange={(e) => setNewRule({ ...newRule, categoriaMacro: e.target.value })} className="px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary">
                    <option value="">Categoria...</option>
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <input type="number" placeholder="Prioridade" value={newRule.prioridade} onChange={(e) => setNewRule({ ...newRule, prioridade: Number(e.target.value) })} className="px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary" />
                <button onClick={addRule} className="btn-primary flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Adicionar</button>
            </div>

            {/* Rules list */}
            <div className="space-y-2">
                {rules.map((r) => (
                    <div key={r.id} className={cn('flex items-center gap-4 p-3 rounded-xl', r.ativa ? 'bg-surface-700' : 'bg-surface-700/50 opacity-60')}>
                        <button onClick={() => toggleRule(r.id!, r.ativa)} className={cn('w-10 h-6 rounded-full transition-colors', r.ativa ? 'bg-success' : 'bg-surface-600')}>
                            <div className={cn('w-4 h-4 bg-white rounded-full transition-transform mx-1', r.ativa ? 'translate-x-4' : '')} />
                        </button>
                        <span className="font-medium text-text-primary flex-1">{r.nome}</span>
                        <span className="text-xs text-text-muted">{r.keywords.join(', ')}</span>
                        <span className="px-2 py-1 bg-surface-600 rounded text-xs">{CATEGORIES.find(c => c.id === r.categoriaMacro)?.label || r.categoriaMacro}</span>
                        <span className="text-xs text-text-muted">P: {r.prioridade}</span>
                        <button onClick={() => deleteRule(r.id!)} className="p-2 text-danger hover:bg-danger/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                ))}
            </div>
        </div>
    );
}


function IaTab() {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        db.appSettings.get('googleApiKey').then((r) => {
            if (r?.value) setApiKey(r.value);
        });
    }, []);

    const handleSave = async () => {
        await db.appSettings.put({ id: 'googleApiKey', value: apiKey.trim() });
        setSaved(true);
        toast.success('API Key salva com sucesso!');
        setTimeout(() => setSaved(false), 2000);
    };

    const handleTest = async () => {
        if (!apiKey.trim()) { toast.error('Digite a API Key primeiro.'); return; }
        setTesting(true);
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const models: { name: string }[] = data.models || [];
            const flash = models.find((m) => m.name.toLowerCase().includes('flash'));
            if (flash) {
                toast.success(`Conexão OK! Modelo selecionado: ${flash.name.replace('models/', '')}`);
            } else {
                toast.warning('Conexão OK, mas nenhum modelo "flash" encontrado.');
            }
        } catch (e) {
            toast.error(`Erro ao conectar: ${e instanceof Error ? e.message : 'Verifique a key.'}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="card p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-xl">
                    <Brain className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-text-primary">Classificação com IA</h3>
                    <p className="text-sm text-text-secondary">
                        Usa o Google Gemini (free tier) para classificar transações automaticamente.
                    </p>
                </div>
            </div>

            <div className="space-y-4 p-4 bg-surface-700/50 rounded-xl">
                <div>
                    <label className="text-sm font-medium text-text-primary block mb-1.5">
                        Google AI API Key
                    </label>
                    <p className="text-xs text-text-muted mb-3">
                        Obtenha em <span className="text-primary-400">aistudio.google.com</span>. A key começa com "AIza...".
                        É salva apenas no seu navegador (IndexedDB), nunca em servidores externos.
                    </p>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="AIzaSy..."
                                className="w-full pl-9 pr-10 py-2.5 bg-surface-700 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary-500 font-mono"
                            />
                            <button
                                onClick={() => setShowKey((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                            >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <button
                            onClick={handleTest}
                            disabled={testing || !apiKey.trim()}
                            className="px-4 py-2.5 bg-surface-600 hover:bg-surface-500 disabled:opacity-50 text-text-primary rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        >
                            {testing ? 'Testando...' : 'Testar'}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!apiKey.trim()}
                            className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                            {saved ? 'Salvo!' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm text-text-secondary space-y-1">
                <p className="font-medium text-text-primary">Como funciona:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Na tela de Pendências, clique em <strong>"Classificar com IA"</strong></li>
                    <li>O sistema detecta automaticamente o melhor modelo Gemini disponível na sua conta</li>
                    <li>As transações sem categoria são enviadas em lotes de 20 para classificação</li>
                    <li>Cada transação recebe categoria, subcategoria e confiança de 85%</li>
                    <li>Você ainda pode revisar e corrigir os resultados na tela de Pendências</li>
                </ul>
            </div>
        </div>
    );
}

function BackupTab() {
    const { fileHandle, connectFile, saveToFile, isAutoSaving } = useFileSystem();

    const getAllData = async () => {
        return {
            transactions: await db.transactions.toArray(),
            rules: await db.rules.toArray(),
            closings: await db.closings.toArray(),
            importLogs: await db.importLogs.toArray(),
            version: 1,
            timestamp: Date.now()
        };
    };

    const handleConnectAndSave = async () => {
        const handle = await connectFile();
        if (handle) {
            const data = await getAllData();
            await saveToFile(data);
        }
    };

    const handleManualExport = async () => {
        const data = await getAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `financeiro_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    };

    const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (confirm('Isso irá substituir seus dados atuais. Deseja continuar?')) {
                await db.transaction('rw', db.transactions, db.rules, db.closings, db.importLogs, async () => {
                    await db.transactions.clear();
                    await db.rules.clear();
                    await db.closings.clear();
                    await db.importLogs.clear();

                    if (data.transactions) await db.transactions.bulkAdd(data.transactions);
                    if (data.rules) await db.rules.bulkAdd(data.rules);
                    if (data.closings) await db.closings.bulkAdd(data.closings);
                    if (data.importLogs) await db.importLogs.bulkAdd(data.importLogs);
                });
                toast.success('Backup restaurado com sucesso!');
            }
        } catch (error) {
            console.error(error);
            toast.error('Erro ao restaurar backup. Arquivo inválido?');
        }
    };

    const clearAll = async () => {
        if (!confirm('Tem certeza? Isso apagará TODOS os dados do navegador! Se não tiver backup, já era.')) return;
        await db.transactions.clear();
        await db.importLogs.clear();
        await db.closings.clear();
        // await db.merchantMappings.clear(); // If exists
        toast.success('Dados limpos!');
    };

    return (
        <div className="card p-6 space-y-6">
            <h3 className="text-lg font-semibold text-text-primary">Backup & Restauração</h3>

            {/* File System Integration */}
            <div className="card p-6 bg-surface-700/30 border border-primary-500/20 mb-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-primary-500/10 rounded-xl">
                        <FolderSync className="w-8 h-8 text-primary-400" />
                    </div>
                    <div>
                        <h4 className="text-lg font-semibold text-text-primary">Salvar em Arquivo Local (PC)</h4>
                        <p className="text-sm text-text-muted">
                            Escolha uma pasta no seu computador para salvar uma cópia segura dos seus dados.
                            Isso cria um arquivo "físico" que não somem se você limpar o navegador.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-surface-800 rounded-xl border border-white/5">
                    {fileHandle ? (
                        <div className="flex items-center gap-3 text-success">
                            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                            <span className="font-medium">Conectado: {fileHandle.name}</span>
                            {isAutoSaving && <span className="text-xs text-text-secondary animate-pulse">(Salvando...)</span>}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 text-text-muted">
                            <div className="w-2 h-2 bg-text-muted rounded-full" />
                            <span>Nenhum arquivo conectado</span>
                        </div>
                    )}

                    <button
                        onClick={handleConnectAndSave}
                        disabled={isAutoSaving}
                        className="ml-auto px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        {fileHandle ? 'Salvar Novamente' : 'Conectar e Salvar'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <button onClick={handleManualExport} className="p-6 bg-surface-700 hover:bg-surface-600 rounded-xl text-center transition-colors">
                    <Save className="w-8 h-8 text-success mx-auto mb-2" />
                    <span className="text-text-primary font-medium">Download JSON</span>
                    <p className="text-xs text-text-muted mt-1">Baixar manualmente agora</p>
                </button>
                <label className="p-6 bg-surface-700 hover:bg-surface-600 rounded-xl text-center transition-colors cursor-pointer">
                    <input type="file" accept=".json" onChange={importData} className="hidden" />
                    <Plus className="w-8 h-8 text-primary-400 mx-auto mb-2" />
                    <span className="text-text-primary font-medium">Restaurar Backup</span>
                    <p className="text-xs text-text-muted mt-1">Carregar arquivo .json</p>
                </label>

                {/* V2 Migration Button */}
                <button
                    onClick={async () => {
                        if (!confirm('Iniciar migração V2? Certifique-se de ter um backup.')) return;
                        try {
                            const count = await migrateV2Categories();
                            toast.success(`Migração concluída! ${count} transações atualizadas.`);
                        } catch (e) {
                            console.error(e);
                            toast.error('Erro na migração.');
                        }
                    }}
                    className="p-6 bg-surface-700 hover:bg-surface-600 border border-primary-500/30 rounded-xl text-center transition-colors group"
                >
                    <Brain className="w-8 h-8 text-accent mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-accent font-medium">Migração V2</span>
                    <p className="text-xs text-text-muted mt-1">Atualizar Categorias</p>
                </button>

                <button onClick={clearAll} className="p-6 bg-danger/10 hover:bg-danger/20 border border-danger/20 rounded-xl text-center transition-colors">
                    <Trash2 className="w-8 h-8 text-danger mx-auto mb-2" />
                    <span className="text-danger font-medium">Limpar Tudo</span>
                    <p className="text-xs text-text-muted mt-1">Zerar banco de dados</p>
                </button>
            </div>
        </div>
    );
}
