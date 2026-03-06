"use client";

import React, { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useEffect } from "react";
import { createTransaction, markTransactionAsPaid, deleteTransaction } from "@/actions/transaction";

export default function DashboardClient({ data }: { data: any }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const [txType, setTxType] = useState("expense");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewSource, setShowNewSource] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [verifiedTime, setVerifiedTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());

  // Commission logic states
  const [isCommission, setIsCommission] = useState(false);
  const [contractValue, setContractValue] = useState("");
  const [commissionPct, setCommissionPct] = useState("10");

  let computedAmount = "";
  if (isCommission && contractValue && commissionPct) {
    const cv = parseFloat(contractValue.replace(/\./g, "").replace(",", ".") || "0");
    const pct = parseFloat(commissionPct || "0");
    computedAmount = ((cv * pct) / 100).toLocaleString("pt-br", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const { kpis, recentTransactions, allTransactions, defaultAccountId, spentByNature } = data;

  async function handleDelete(id: string, type: "income" | "expense") {
    if (!confirm("Certeza que deseja apagar este lançamento?")) return;
    setDeletingId(id);
    await deleteTransaction(id, type);
    setDeletingId(null);
  }

  async function handleMarkPaid(id: string, type: "income" | "expense") {
    setPayingId(id);
    await markTransactionAsPaid(id, type);
    setPayingId(null);
  }

  // Sync with Global Network Time
  useEffect(() => {
    async function syncTime() {
      setIsSyncing(true);
      try {
        const response = await fetch("https://worldtimeapi.org/api/timezone/America/Sao_Paulo");
        const data = await response.json();
        const networkDate = new Date(data.datetime);
        setVerifiedTime(networkDate);
        setLiveTime(networkDate);
      } catch (err) {
        console.warn("Retrying time sync...", err);
        setVerifiedTime(new Date());
      }
      setIsSyncing(false);
    }
    syncTime();

    const interval = setInterval(() => {
      setLiveTime(prev => new Date(prev.getTime() + 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const chartData = [
    { day: "01 " + liveTime.toLocaleDateString("pt-BR", { month: 'short' }).toUpperCase(), actual: kpis.accountBalance * 0.8, projected: kpis.accountBalance * 0.8 },
    { day: "HOJE", actual: kpis.accountBalance, projected: kpis.accountBalance },
    { day: liveTime.toLocaleDateString("pt-BR", { day: '2-digit', month: 'short' }).toUpperCase(), actual: null, projected: kpis.projectedBalance },
  ];

  async function handleSubmit(e: any) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.target);
    formData.append("accountId", defaultAccountId);

    await createTransaction(formData);

    setIsSubmitting(false);
    setIsModalOpen(false);
  }

  const totalSpentAndPending = kpis.paidExpense + kpis.pendingExpense;

  return (
    <div className="flex h-screen bg-mesh text-slate-100 font-sans selection:bg-primary/30 overflow-hidden">
      {/* SIDEBAR (Desktop) */}
      <aside className="w-20 lg:w-64 bg-slate-900/40 backdrop-blur-xl border-r border-white/5 flex flex-col hidden md:flex shrink-0">
        <div className="h-20 flex items-center px-6 gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>
          <div className="hidden lg:block truncate">
            <h1 className="text-sm font-bold leading-tight">Financial Command</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Intelligence Pro</p>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          <NavItem
            icon="dashboard"
            label="Painel"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <NavItem
            icon="payments"
            label="Receitas"
            active={activeTab === "incomes"}
            onClick={() => setActiveTab("incomes")}
          />
          <NavItem
            icon="receipt_long"
            label="Despesas"
            active={activeTab === "expenses"}
            onClick={() => setActiveTab("expenses")}
          />
          <NavItem
            icon="calendar_month"
            label="Agenda"
            badge={recentTransactions.filter((r: any) => r.status === 'pending').length.toString()}
            active={activeTab === "agenda"}
            onClick={() => setActiveTab("agenda")}
          />
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER BAR */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 lg:px-10 z-10 w-full shrink-0 bg-slate-900/20 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors px-3 py-1.5 rounded-lg border border-white/10">
              <span className={`material-symbols-outlined text-sm ${isSyncing ? "animate-spin text-primary" : "text-emerald-500"}`}>
                {isSyncing ? "sync" : "public"}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {liveTime.toLocaleDateString("pt-BR", { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-mono font-bold text-white tabular-nums">
                {liveTime.toLocaleTimeString("pt-BR")}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
              <input className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm w-48 lg:w-64 focus:ring-2 focus:ring-primary h-10 outline-none transition-all" placeholder="Buscar transação..." type="text" />
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white h-10 px-4 rounded-xl text-sm font-bold flex items-center shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined mr-2">add</span> Lançamento
            </button>
          </div>
        </header>

        {/* SCROLL AREA */}
        <div className="flex-1 overflow-auto p-6 lg:p-10 pb-32">
          <div className="max-w-7xl mx-auto space-y-10">
            {activeTab === "dashboard" && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="text-3xl font-black text-white tracking-tight">
                    Olá, {data.user?.name || "Comandante"}
                  </h2>
                  <p className="text-slate-400 text-sm font-medium">Sua inteligência local SQLite está atualizada.</p>
                </div>

                {/* KPI TILES */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KpiCard
                    title="Saldo Atual"
                    value={`R$ ${kpis.accountBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend="+2.4%"
                    trendUp={true}
                    icon="account_balance"
                    color="primary"
                  />
                  <KpiCard
                    title="Receita Confirmada"
                    value={`R$ ${kpis.actualIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend={`Falta R$ ${kpis.remainingIncome}`}
                    trendUp={true}
                    icon="trending_up"
                    color="success"
                  />
                  <KpiCard
                    title="Despesa Efetiva"
                    value={`R$ ${kpis.paidExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend={`Pendente R$ ${kpis.pendingExpense}`}
                    trendUp={false}
                    icon="payments"
                    color="danger"
                  />
                  <KpiCard
                    title="Saldo Projetado"
                    value={`R$ ${kpis.projectedBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    trend="Projeção final"
                    icon="query_stats"
                    color="warning"
                  />
                </div>

                {/* COMMISSION BANNER */}
                {kpis.pendingCommissions > 0 && (
                  <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 to-slate-900 border border-primary/20 p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all hover:border-primary/40 shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] -z-10 group-hover:bg-primary/30 transition-colors"></div>
                    <div>
                      <h2 className="text-2xl font-black text-white flex items-center tracking-tight">
                        <span className="material-symbols-outlined text-primary text-3xl mr-3">target</span>
                        Comissões no Radar
                      </h2>
                      <p className="text-slate-400 text-sm mt-2 max-w-md font-medium">Você tem valores significativos para liquidar este mês. Mantenha o foco na execução.</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-8 py-4 backdrop-blur-md">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Total em Aberto</span>
                      <div className="text-4xl font-black text-white mt-1">
                        R$ {kpis.pendingCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* CHART */}
                  <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-xl">
                    <div className="flex justify-between items-center mb-10">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">distance</span>
                        Trajetória de Caixa
                      </h3>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#135bec" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#135bec" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }} dy={15} />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                            itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                          />
                          <Area type="monotone" dataKey="actual" stroke="#135bec" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" connectNulls />
                          <Area type="monotone" dataKey="projected" stroke="rgba(255,255,255,0.2)" strokeWidth={2} strokeDasharray="8 8" fill="none" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* RECENT ACTIONS / WIDGET */}
                  <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 flex flex-col shadow-xl">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-8">Movimentações</h3>
                    <div className="flex-1 space-y-4">
                      {recentTransactions.length === 0 ? (
                        <div className="text-sm text-slate-500 text-center py-20 italic">Centro sem comando.</div>
                      ) : recentTransactions.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.08] transition-all group">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'income' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                              <span className="material-symbols-outlined text-xl">{t.type === 'income' ? 'add' : 'remove'}</span>
                            </div>
                            <div className="max-w-[120px]">
                              <p className="text-sm font-bold text-white truncate">{t.name}</p>
                              <p className="text-[10px] text-slate-500 font-bold uppercase">{t.displayDate}</p>
                            </div>
                          </div>
                          <p className={`text-sm font-black ${t.type === 'income' ? 'text-success' : 'text-white'}`}>
                            {t.type === 'income' ? '+' : '-'} {Math.abs(t.amount).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {(activeTab === "incomes" || activeTab === "expenses" || activeTab === "agenda") && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                    {activeTab === "incomes" ? "Portfólio de Receitas" : activeTab === "expenses" ? "Centro de Despesas" : "Agenda de Compromissos"}
                  </h2>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                  <div className="p-8 space-y-4">
                    {allTransactions.filter((t: any) =>
                      activeTab === "agenda" ? true : t.type === (activeTab === "incomes" ? "income" : "expense")
                    ).length === 0 ? (
                      <div className="py-20 text-center text-slate-500 font-medium">Nenhum registro tático encontrado.</div>
                    ) : allTransactions
                      .filter((t: any) => activeTab === "agenda" ? true : t.type === (activeTab === "incomes" ? "income" : "expense"))
                      .map((t: any) => (
                        <TransactionRow
                          key={t.id}
                          t={t}
                          payingId={payingId}
                          deletingId={deletingId}
                          handleMarkPaid={handleMarkPaid}
                          handleDelete={handleDelete}
                        />
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM NAV (MOBILE) */}
        <nav className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center justify-around px-2 z-[100] shadow-2xl shadow-black">
          <MobileNavItem icon="dashboard" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
          <MobileNavItem icon="payments" active={activeTab === "incomes"} onClick={() => setActiveTab("incomes")} />
          <MobileNavItem icon="receipt_long" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <MobileNavItem icon="calendar_month" active={activeTab === "agenda"} onClick={() => setActiveTab("agenda")} />
        </nav>
      </main>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Novo Lançamento</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-0 space-y-6">
              <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTxType("income")}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${txType === 'income' ? 'bg-primary text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  Receita
                </button>
                <button
                  type="button"
                  onClick={() => setTxType("expense")}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${txType === 'expense' ? 'bg-primary text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  Despesa
                </button>
              </div>
              <input type="hidden" name="type" value={txType} />

              <div className="space-y-4">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Descrição</label>
                  <input required name="title" list="suggestions" placeholder="Ex: Venda de Consultoria, Aluguel..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
                  <datalist id="suggestions">
                    {txType === "expense" ? (
                      <>
                        <option value="Mercado" /> <option value="Gasolina" /> <option value="Aluguel" />
                        <option value="Internet" /> <option value="Luz/Energia" /> <option value="Condomínio" />
                      </>
                    ) : (
                      <>
                        <option value="Salário" /> <option value="Comissão" /> <option value="Dividendos" /> <option value="Freelance" />
                      </>
                    )}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor (R$)</label>
                    <input required name="amount" placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all font-bold" />
                  </div>
                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Vencimento</label>
                    <input required name="dueDate" type="date" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
                  </div>
                </div>

                {txType === "income" && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="isComm" checked={isCommission} onChange={(e) => setIsCommission(e.target.checked)} className="w-5 h-5 rounded border-white/10 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0" />
                      <label htmlFor="isComm" className="text-sm font-bold text-slate-300">Cálculo de Comissão Automatizado</label>
                    </div>
                    {isCommission && (
                      <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                        <input placeholder="Valor Venda" value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="bg-white/10 border-none rounded-lg p-2 text-xs text-white" />
                        <select value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className="bg-white/10 border-none rounded-lg p-2 text-xs text-white">
                          <option value="10">10%</option><option value="20">20%</option><option value="30">30%</option><option value="40">40%</option><option value="50">50%</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Notas / Cliente</label>
                  <textarea name="notes" rows={2} placeholder="Identifique o cliente ou projeto..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm" />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-xl text-sm font-bold text-slate-500 hover:text-white transition-colors">Cancelar</button>
                <button
                  disabled={isSubmitting}
                  type="submit"
                  className="flex-[2] h-12 bg-primary text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Gravando..." : "Confirmar Lançamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ t, payingId, deletingId, handleMarkPaid, handleDelete }: any) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/[0.08] transition-all group relative overflow-hidden">
      <div className="flex items-center gap-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${t.type === "income" ? "bg-success/10 text-success shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "bg-danger/10 text-danger shadow-[0_0_20px_rgba(244,63,94,0.1)]"}`}>
          <span className="material-symbols-outlined text-2xl">{t.type === "income" ? "arrow_downward" : "arrow_upward"}</span>
        </div>
        <div>
          <h4 className="text-lg font-bold text-white tracking-tight">{t.name}</h4>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-widest ${t.status === 'paid' || t.status === 'received' ? 'bg-white/10 text-slate-500' : 'bg-warning/20 text-warning'}`}>
              {t.status === 'expected' || t.status === 'pending' ? 'Pendente' : 'Liquidado'}
            </span>
            <span className="text-xs font-bold text-slate-500">Vence {t.displayDate}</span>
          </div>
          {t.notes && <p className="text-xs text-slate-400 mt-2 italic flex items-center gap-1.5"><span className="material-symbols-outlined text-xs">info</span> {t.notes}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-6 mt-4 sm:mt-0 pl-20 sm:pl-0 w-full sm:w-auto">
        <div className={`text-2xl font-black tracking-tighter ${t.type === 'income' ? 'text-success' : 'text-white'}`}>
          {t.type === 'income' ? '+' : '-'} R$ {Math.abs(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
        <div className="flex items-center gap-2 lg:opacity-0 group-hover:opacity-100 transition-all">
          {(t.status === "pending" || t.status === "expected") && (
            <button
              disabled={payingId === t.id}
              onClick={() => handleMarkPaid(t.id, t.type)}
              className="bg-white text-slate-900 h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-xl active:scale-95"
            >
              Baixar
            </button>
          )}
          <button
            disabled={deletingId === t.id}
            onClick={() => handleDelete(t.id, t.type)}
            className="w-10 h-10 rounded-xl bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center active:scale-90 shadow-xl"
          >
            <span className="material-symbols-outlined text-xl">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, badge, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300 group ${active ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" : "text-slate-500 hover:text-white hover:bg-white/5"}`}
    >
      <span className={`material-symbols-outlined transition-colors ${active ? "text-white" : "group-hover:text-primary"}`}>{icon}</span>
      <span className="hidden lg:block uppercase tracking-widest text-[11px] font-black">{label}</span>
      {badge && badge !== "0" && !active && <span className="ml-auto bg-primary text-white text-[10px] h-5 w-5 rounded-full flex items-center justify-center font-black animate-pulse">{badge}</span>}
    </button>
  );
}

function MobileNavItem({ icon, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`p-3 rounded-xl transition-all ${active ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110' : 'text-slate-500'}`}>
      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: active ? "'FILL' 1" : "" }}>{icon}</span>
    </button>
  );
}

function KpiCard({ title, value, trend, trendUp, icon, color }: any) {
  const colors: any = {
    primary: "from-primary/20 to-primary/5 text-primary border-primary/20 shadow-primary/5",
    success: "from-success/20 to-success/5 text-success border-success/20 shadow-success/5",
    danger: "from-danger/20 to-danger/5 text-danger border-danger/20 shadow-danger/5",
    warning: "from-warning/20 to-warning/5 text-warning border-warning/20 shadow-warning/5",
  };

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${colors[color]} backdrop-blur-xl border rounded-[2rem] p-6 shadow-2xl transition-all hover:scale-[1.02] hover:border-white/20 group`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{title}</h3>
        <div className={`p-2.5 rounded-xl bg-white/10 backdrop-blur-md`}>
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
      </div>
      <div>
        <div className="text-2xl font-black text-white tracking-tighter mb-2 truncate">{value}</div>
        <div className="flex items-center justify-between">
          <div className={`text-[10px] font-black px-2 py-0.5 rounded bg-white/5 ${trendUp ? 'text-success' : 'text-danger'}`}>{trend}</div>
        </div>
      </div>
    </div>
  );
}
