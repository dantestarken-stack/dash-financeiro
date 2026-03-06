"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Activity,
  Target,
  PieChart,
  Settings,
  Bell,
  Search,
  Plus,
  ChevronDown,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Building2,
  X,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createTransaction, markTransactionAsPaid } from "@/actions/transaction";

export default function DashboardClient({ data }: { data: any }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const { kpis, recentTransactions, allTransactions, defaultAccountId } = data;

  async function handleMarkPaid(id: string, type: "income" | "expense") {
    setPayingId(id);
    await markTransactionAsPaid(id, type);
    setPayingId(null);
  }

  // Calculo simplório para a variação da tabela chartMock baseada em real, mas num MVP 1 a gente pode usar fixo se o BD tiver vazio.
  const chartData = [
    { day: "Proj. Saldo Anterior", actual: 0, projected: 0 },
    { day: "Saldo Atual", actual: kpis.accountBalance, projected: kpis.accountBalance },
    { day: "Final Prox Semana", actual: null, projected: kpis.accountBalance + (kpis.remainingIncome / 2) - (kpis.pendingExpense / 2) },
    { day: "Final do Mês", actual: null, projected: kpis.projectedBalance },
  ];

  async function handleSubmit(e: any) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.target);
    formData.append("accountId", defaultAccountId); // Passa a conta corrente default

    await createTransaction(formData);

    setIsSubmitting(false);
    setIsModalOpen(false);
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <Activity className="w-6 h-6 text-blue-500 mr-2" />
          <span className="font-bold text-lg tracking-tight text-white">
            Command Center
          </span>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          <NavItem
            icon={<LayoutDashboard />}
            label="Dashboard"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <NavItem
            icon={<ArrowDownToLine />}
            label="Receitas"
            active={activeTab === "incomes"}
            onClick={() => setActiveTab("incomes")}
          />
          <NavItem
            icon={<ArrowUpFromLine />}
            label="Despesas"
            active={activeTab === "expenses"}
            onClick={() => setActiveTab("expenses")}
          />
          <NavItem
            icon={<CalendarDays />}
            label="Agenda"
            badge={recentTransactions.filter((r: any) => r.status === 'pending').length.toString()}
            active={activeTab === "agenda"}
            onClick={() => setActiveTab("agenda")}
          />
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* HEADER BAR */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10 w-full shrink-0">
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-200">
              <span className="text-sm font-medium mr-2">Mês Atual</span>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Lançamento
            </button>
          </div>
        </header>

        {/* DASHBOARD SCROLL AREA */}
        <div className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {activeTab === "dashboard" && (
              <>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                      Bem-vindo, {data.user?.name || "Líder"}!
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                      Estes são os dados consolidados da sua base local SQLite.
                    </p>
                  </div>
                </div>

                {/* FAIXA 1: KPIs (Dados Vivos) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    title="Saldo em Conta"
                    value={`R$ ${kpis.accountBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend="Base atual"
                    trendUp={true}
                    icon={<Building2 className="w-5 h-5 text-blue-500" />}
                    color="blue"
                  />
                  <KpiCard
                    title="Receita Consolidada (Confirmada)"
                    value={`R$ ${kpis.actualIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend={`Falta receber R$ ${kpis.remainingIncome}`}
                    trendUp={true}
                    icon={<ArrowDownToLine className="w-5 h-5 text-emerald-500" />}
                    color="green"
                  />
                  <KpiCard
                    title="Despesa Efetiva (Paga)"
                    value={`R$ ${kpis.paidExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend={`Pendente/Avencer R$ ${kpis.pendingExpense}`}
                    trendUp={false}
                    icon={<ArrowUpFromLine className="w-5 h-5 text-rose-500" />}
                    color="red"
                  />
                  <KpiCard
                    title="Saldo Projetado (Futuro)"
                    value={`R$ ${kpis.projectedBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend="Se tudo ocorrer como previsto."
                    trendUp={kpis.projectedBalance >= 0}
                    icon={kpis.projectedBalance >= 0 ? <TrendingUp className="w-5 h-5 text-amber-500" /> : <TrendingDown className="w-5 h-5 text-rose-500" />}
                    color="amber"
                  />
                </div>

                {/* FAIXA 2: Gráfico e Agenda */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* O Fluxo Futuro */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-800">Trajetória do Caixa (Mês)</h2>
                      </div>
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => `R$ ${val}`} />
                          <Tooltip />
                          <Area type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.2} connectNulls />
                          <Area type="monotone" dataKey="projected" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Agenda Financeira Rápida */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                    <h2 className="text-lg font-bold text-slate-800 mb-6">Relatório de Transações</h2>
                    <div className="flex-1 overflow-auto pr-2 space-y-4">
                      {recentTransactions.length === 0 ? (
                        <div className="text-sm text-slate-400 text-center mt-10">
                          Nenhuma transação cadastrada. Use o botão +Lançamento para testar o banco!
                        </div>
                      ) : recentTransactions.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-slate-100 group">
                          <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${t.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                              }`}>
                              {t.type === "income" ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-slate-800">{t.name}</p>
                              <span className={`px-1.5 py-[1px] rounded font-medium text-[10px] uppercase tracking-wider ${t.status === "received" || t.status === "paid" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"
                                }`}>{t.status === "expected" || t.status === "pending" ? "A vencer/esperado" : t.status === "received" || t.status === "paid" ? "Baixado" : t.status} • {t.date}</span>
                            </div>
                          </div>
                          <div className={`font-semibold text-sm tracking-tight ${t.type === "income" ? "text-emerald-600" : "text-rose-600"
                            }`}>
                            {t.type === "income" ? "+" : "-"} R$ {Math.abs(t.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "agenda" && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Agenda Financeira</h1>
                    <p className="text-slate-500 text-sm mt-1">Gerencie compromissos a pagar e valores a receber.</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden">
                  <div className="space-y-4">
                    {allTransactions.length === 0 ? (
                      <div className="text-sm text-slate-400 text-center py-10">
                        Sua agenda está vazia para este mês.
                      </div>
                    ) : allTransactions.map((t: any) => (
                      <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-all group">
                        <div className="flex items-start sm:items-center mb-4 sm:mb-0">
                          <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center mr-4 ${t.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                            }`}>
                            {t.type === "income" ? <ArrowDownToLine className="w-5 h-5" /> : <ArrowUpFromLine className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-base">{t.name}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <span className={`px-2 py-0.5 rounded font-semibold text-[10px] uppercase tracking-wider ${t.status === "received" || t.status === "paid" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"
                                }`}>{t.status === "expected" || t.status === "pending" ? "A vencer/esperado" : t.status === "received" || t.status === "paid" ? "Baixado" : t.status}</span>
                              <span className="text-xs font-medium text-slate-500">Vencimento: {t.displayDate}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto mt-2 sm:mt-0 space-x-4 pl-14 sm:pl-0">
                          <div className={`font-bold text-lg tracking-tight ${t.type === "income" ? "text-emerald-600" : "text-slate-900"
                            }`}>
                            {t.type === "income" ? "+" : "-"} R$ {Math.abs(t.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </div>

                          {(t.status === "pending" || t.status === "expected") && (
                            <button
                              disabled={payingId === t.id}
                              onClick={() => handleMarkPaid(t.id, t.type)}
                              className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
                            >
                              {payingId === t.id ? "Marcando..." : (t.type === "income" ? "Dar Baixa" : "Pagar Conta")}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODAL DE NOVO LANÇAMENTO (OVERLAY) */}
        {isModalOpen && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-bold text-lg">Novo Lançamento</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Movimentação</label>
                  <select name="type" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="expense">Despesa (Contas a Pagar)</option>
                    <option value="income">Receita (A Receber / Entradas)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                  <input name="title" required type="text" placeholder="Ex: Cartão de Crédito, Salário..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Valor Previsto (R$)</label>
                    <input name="amount" required type="number" step="0.01" min="0" placeholder="0.00" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Data Vencimento</label>
                    <input name="dueDate" required type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                </div>

                <div className="pt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-100">
                  <span className="font-semibold block mb-1">Nota da Regra Financeira:</span>
                  Novas receitas nascem como "Esperadas" e Novas despesas nascem como "Pendentes" (A vencer) indo para sua Projeção de Caixa sem afetar o saldo em conta livre real logo de cara.
                </div>

                <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {isSubmitting ? "Processando..." : "Gravar Lançamento"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Subcomponents helper

function NavItem({ icon, label, active, badge, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${active ? "bg-blue-600/10 text-blue-500" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`}
    >
      <div className="flex items-center">
        <span className={`mr-3 ${active ? "opacity-100" : "opacity-70"}`}>{icon && React.cloneElement(icon, { className: "w-5 h-5" })}</span>
        {label}
      </div>
      {badge && badge !== "0" && <span className="bg-rose-500 text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shadow-sm">{badge}</span>}
    </button>
  );
}

function KpiCard({ title, value, trend, trendUp, icon, color }: any) {
  const colorMap: any = {
    blue: "bg-blue-50 border-blue-100",
    green: "bg-emerald-50 border-emerald-100",
    red: "bg-rose-50 border-rose-100",
    amber: "bg-amber-50 border-amber-100",
  };
  const trendColor = trendUp ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full ${colorMap[color]} opacity-50 -z-10 group-hover:scale-110 transition-transform`}></div>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</div>
      </div>
      <div>
        <div className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">{value}</div>
        <div className="flex items-center justify-between mt-2">
          <div className={`flex items-center text-xs font-semibold ${trendColor}`}>{trend}</div>
        </div>
      </div>
    </div>
  );
}
