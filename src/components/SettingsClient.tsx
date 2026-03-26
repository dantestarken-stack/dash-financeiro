"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, updateFinancialProfile, changePassword } from "@/actions/settings";

interface Props {
    user: { name: string; email: string } | null;
    profile: {
        monthlyFixedIncome?: number | null;
        savingsGoalPercentage?: number | null;
        financialPriority?: string | null;
    } | null;
}

export default function SettingsClient({ user, profile }: Props) {
    const router = useRouter();
    const [saving, setSaving] = useState<string | null>(null);
    const [messages, setMessages] = useState<Record<string, { type: "success" | "error"; text: string }>>({});

    function setMsg(section: string, type: "success" | "error", text: string) {
        setMessages(prev => ({ ...prev, [section]: { type, text } }));
        setTimeout(() => setMessages(prev => { const n = { ...prev }; delete n[section]; return n; }), 3000);
    }

    async function handleProfile(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving("profile");
        const result = await updateProfile(new FormData(e.currentTarget));
        setSaving(null);
        if (result?.error) setMsg("profile", "error", result.error);
        else { setMsg("profile", "success", "Nome atualizado!"); router.refresh(); }
    }

    async function handleFinancial(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving("financial");
        const result = await updateFinancialProfile(new FormData(e.currentTarget));
        setSaving(null);
        if (result?.error) setMsg("financial", "error", result.error);
        else setMsg("financial", "success", "Perfil financeiro atualizado!");
    }

    async function handlePassword(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving("password");
        const result = await changePassword(new FormData(e.currentTarget));
        setSaving(null);
        if (result?.error) setMsg("password", "error", result.error);
        else { setMsg("password", "success", "Senha alterada com sucesso!"); (e.target as HTMLFormElement).reset(); }
    }

    const incomeValue = profile?.monthlyFixedIncome
        ? (profile.monthlyFixedIncome / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "";

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="max-w-2xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="flex items-center gap-4 mb-10">
                    <button onClick={() => router.push("/")} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                        <span className="material-symbols-outlined text-slate-400">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter text-white">Configurações</h1>
                        <p className="text-slate-500 text-sm">Gerencie sua conta e preferências</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Perfil */}
                    <div className="bg-slate-900/60 border border-white/8 rounded-3xl p-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base text-primary">person</span>
                            Perfil
                        </h2>
                        <form onSubmit={handleProfile} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Nome</label>
                                <input
                                    name="name"
                                    defaultValue={user?.name ?? ""}
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Email</label>
                                <input
                                    value={user?.email ?? ""}
                                    disabled
                                    className="w-full bg-white/3 border border-white/5 rounded-xl px-4 py-3 text-slate-500 outline-none cursor-not-allowed"
                                />
                                <p className="text-[10px] text-slate-600 ml-1 mt-1">O email não pode ser alterado.</p>
                            </div>
                            {messages.profile && (
                                <p className={`text-xs font-bold ${messages.profile.type === "success" ? "text-success" : "text-danger"}`}>
                                    {messages.profile.text}
                                </p>
                            )}
                            <button
                                type="submit"
                                disabled={saving === "profile"}
                                className="h-11 px-6 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:opacity-90 transition-all"
                            >
                                {saving === "profile" ? "Salvando..." : "Salvar Nome"}
                            </button>
                        </form>
                    </div>

                    {/* Perfil Financeiro */}
                    <div className="bg-slate-900/60 border border-white/8 rounded-3xl p-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base text-success">attach_money</span>
                            Perfil Financeiro
                        </h2>
                        <form onSubmit={handleFinancial} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Renda Mensal Fixa (R$)</label>
                                <input
                                    name="monthlyFixedIncome"
                                    defaultValue={incomeValue}
                                    placeholder="0,00"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-success transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Meta de Poupança (%)</label>
                                <input
                                    name="savingsGoalPercentage"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    defaultValue={profile?.savingsGoalPercentage ?? ""}
                                    placeholder="Ex: 20"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-success transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Prioridade Financeira</label>
                                <select
                                    name="financialPriority"
                                    defaultValue={profile?.financialPriority ?? ""}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-success transition-all"
                                >
                                    <option value="">Selecione...</option>
                                    <option value="savings">Poupar dinheiro</option>
                                    <option value="debt">Quitar dívidas</option>
                                    <option value="invest">Investir</option>
                                    <option value="balance">Equilíbrio geral</option>
                                </select>
                            </div>
                            {messages.financial && (
                                <p className={`text-xs font-bold ${messages.financial.type === "success" ? "text-success" : "text-danger"}`}>
                                    {messages.financial.text}
                                </p>
                            )}
                            <button
                                type="submit"
                                disabled={saving === "financial"}
                                className="h-11 px-6 bg-success text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:opacity-90 transition-all"
                            >
                                {saving === "financial" ? "Salvando..." : "Salvar Perfil Financeiro"}
                            </button>
                        </form>
                    </div>

                    {/* Alterar Senha */}
                    <div className="bg-slate-900/60 border border-white/8 rounded-3xl p-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base text-warning">lock</span>
                            Alterar Senha
                        </h2>
                        <form onSubmit={handlePassword} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Senha Atual</label>
                                <input
                                    name="currentPassword"
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-warning transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Nova Senha</label>
                                <input
                                    name="newPassword"
                                    type="password"
                                    required
                                    minLength={8}
                                    placeholder="Mínimo 8 caracteres"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-warning transition-all"
                                />
                            </div>
                            {messages.password && (
                                <p className={`text-xs font-bold ${messages.password.type === "success" ? "text-success" : "text-danger"}`}>
                                    {messages.password.text}
                                </p>
                            )}
                            <button
                                type="submit"
                                disabled={saving === "password"}
                                className="h-11 px-6 bg-warning text-slate-950 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:opacity-90 transition-all"
                            >
                                {saving === "password" ? "Alterando..." : "Alterar Senha"}
                            </button>
                        </form>
                    </div>

                    {/* Versão */}
                    <div className="text-center py-4">
                        <p className="text-[10px] text-slate-700 font-bold uppercase tracking-widest">Financial Command Center — v1.0</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
