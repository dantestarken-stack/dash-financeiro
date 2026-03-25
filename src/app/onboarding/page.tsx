"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/actions/onboarding";

const STEPS = [
  { id: 1, title: "Bem-vindo!", subtitle: "Vamos configurar seu perfil financeiro em 3 passos rápidos." },
  { id: 2, title: "Sua Renda Fixa", subtitle: "Quanto você recebe de salário fixo por mês?" },
  { id: 3, title: "Sua Prioridade", subtitle: "Qual é o seu objetivo financeiro principal agora?" },
];

const PRIORITIES = [
  { value: "savings", label: "Juntar Dinheiro", icon: "savings", desc: "Construir uma reserva de emergência ou guardar para objetivos" },
  { value: "debt", label: "Pagar Dívidas", icon: "money_off", desc: "Quitar parcelamentos, cartões ou empréstimos pendentes" },
  { value: "invest", label: "Investir", icon: "trending_up", desc: "Fazer o dinheiro trabalhar e construir patrimônio" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [income, setIncome] = useState("");
  const [priority, setPriority] = useState("");
  const [savings, setSavings] = useState("10");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function formatCurrency(val: string) {
    const num = val.replace(/\D/g, "");
    if (!num) return "";
    const n = parseInt(num, 10) / 100;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }

  async function handleFinish() {
    setIsSubmitting(true);
    const form = new FormData();
    const rawIncome = income.replace(/\./g, "").replace(",", ".");
    form.append("monthlyFixedIncome", rawIncome || "0");
    form.append("financialPriority", priority);
    form.append("savingsGoalPercentage", savings);
    await completeOnboarding(form);
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                step >= s.id ? "bg-primary" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-2xl font-black text-white mb-1">{STEPS[step - 1].title}</h2>
          <p className="text-slate-400 mb-8 text-sm">{STEPS[step - 1].subtitle}</p>

          {/* STEP 1 — Welcome */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mx-auto mb-6">
                <span className="material-symbols-outlined text-5xl text-primary">account_balance_wallet</span>
              </div>
              <p className="text-center text-slate-300 text-sm leading-relaxed">
                O <strong className="text-white">Financial Command Center</strong> vai transformar
                seus dados financeiros em clareza e previsibilidade. Configura em menos de 1 minuto.
              </p>
              <button
                onClick={() => setStep(2)}
                className="w-full mt-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all"
              >
                Começar agora →
              </button>
            </div>
          )}

          {/* STEP 2 — Renda Fixa */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Renda fixa mensal (salário)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={income}
                    onChange={(e) => setIncome(formatCurrency(e.target.value))}
                    placeholder="0,00"
                    className="w-full bg-slate-800/60 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-lg font-mono placeholder-slate-600 focus:outline-none focus:border-primary/60"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">Pode deixar em branco se sua renda for totalmente variável.</p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Meta de poupança: <span className="text-primary font-bold">{savings}%</span> da renda
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={savings}
                  onChange={(e) => setSavings(e.target.value)}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0%</span><span>25%</span><span>50%</span>
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 border border-white/10 text-slate-400 font-medium rounded-xl hover:border-white/20 transition-all"
                >
                  ← Voltar
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all"
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Prioridade */}
          {step === 3 && (
            <div className="space-y-4">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                    priority === p.value
                      ? "border-primary bg-primary/10 text-white"
                      : "border-white/10 bg-slate-800/40 text-slate-300 hover:border-white/20"
                  }`}
                >
                  <span className="material-symbols-outlined text-2xl text-primary">{p.icon}</span>
                  <div>
                    <p className="font-semibold text-sm">{p.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.desc}</p>
                  </div>
                  {priority === p.value && (
                    <span className="material-symbols-outlined ml-auto text-primary">check_circle</span>
                  )}
                </button>
              ))}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 border border-white/10 text-slate-400 font-medium rounded-xl hover:border-white/20 transition-all"
                >
                  ← Voltar
                </button>
                <button
                  onClick={handleFinish}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Salvando..." : "✓ Concluir"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
