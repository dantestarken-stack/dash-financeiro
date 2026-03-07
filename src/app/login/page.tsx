"use client";

import React, { useState } from "react";
import { loginAction } from "@/actions/auth";
import Link from "next/link";

export default function LoginPage() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        const formData = new FormData(e.currentTarget);
        const data = await loginAction(formData);
        if (data && data.error) {
            setError(data.error);
            setIsSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-primary/30 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Decorative Orbs */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full -z-10 animate-pulse"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px] rounded-full -z-10"></div>

            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl space-y-8">
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-primary rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg shadow-primary/20 mb-6 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight uppercase">Minhas Finanças</h1>
                        <p className="text-slate-400 text-sm font-medium">Seu centro de inteligência pessoal.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Endereço de Email</label>
                            <input
                                required
                                name="email"
                                type="email"
                                placeholder="ex: comandante@elite.com"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-primary transition-all placeholder:text-slate-600"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Senha de Acesso</label>
                            <input
                                required
                                name="password"
                                type="password"
                                placeholder="••••••••"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-primary transition-all placeholder:text-slate-600"
                            />
                        </div>

                        {error && (
                            <div className="bg-danger/10 border border-danger/20 text-danger text-xs font-bold py-3 px-4 rounded-xl text-center">
                                {error}
                            </div>
                        )}

                        <button
                            disabled={isSubmitting}
                            type="submit"
                            className="w-full h-14 bg-primary text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? "Autenticando..." : "Entrar no Painel"}
                        </button>
                    </form>

                    <div className="text-center pt-4">
                        <p className="text-xs text-slate-500 font-bold">
                            Ainda não tem acesso?{" "}
                            <Link href="/register" className="text-primary hover:underline">
                                Criar conta gratuita
                            </Link>
                        </p>
                    </div>
                </div>
                <p className="mt-8 text-center text-[10px] text-slate-600 font-black uppercase tracking-widest cursor-default">
                    Sistema de Gestão de Elite • v0.1
                </p>
            </div>
        </div>
    );
}
