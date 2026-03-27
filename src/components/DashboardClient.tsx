"use client";

import React, { useState, useEffect } from "react";
import type { DashboardData } from "@/lib/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { getReportData, type ReportData } from "@/actions/reports";
import { useRouter } from "next/navigation";
import { createTransaction, markTransactionAsPaid, deleteTransaction, updateTransaction } from "@/actions/transaction";
import { createAsset, createLiability, deleteAsset, deleteLiability } from "@/actions/patrimony";
import { createCard, deleteCard } from "@/actions/cards";
import { createGoal, updateGoalProgress, deleteGoal, updateCategoryBudget } from "@/actions/goal";
import { logoutAction } from "@/actions/auth";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, isToday, addMonths, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DashboardClient({ data, currentMonth, currentYear }: { data: DashboardData, currentMonth: number, currentYear: number }) {
  const { kpis, recentTransactions, allTransactions, defaultAccountId, debtRecoverySourceId } = data;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isLiabilityModalOpen, setIsLiabilityModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedFormCategoryId, setSelectedFormCategoryId] = useState("");
  const [selectedFormAccountId, setSelectedFormAccountId] = useState(defaultAccountId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const [txType, setTxType] = useState<"income" | "expense" | "debt" | "comm_receipt">("expense");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());

  // Commission logic states
  const [isCommission, setIsCommission] = useState(false);
  const [contractValue, setContractValue] = useState("");
  const [commissionPct, setCommissionPct] = useState("10");

  // Installment logic states
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState("2");

  // Recurring logic state
  const [isRecurring, setIsRecurring] = useState(false);

  // Filter states
  const [globalSearch, setGlobalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Card states
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

  async function handleCreateCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    await createCard(new FormData(e.currentTarget));
    setIsCardModalOpen(false);
    setIsSubmitting(false);
    router.refresh();
  }

  async function handleDeleteCard(id: string) {
    if (!confirm("Deseja remover este cartão?")) return;
    await deleteCard(id);
    router.refresh();
  }

  // Drill-down modal state
  const [drillDown, setDrillDown] = useState<{ title: string; items: any[] } | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

  async function handleEditSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingItem) return;
    setIsEditSaving(true);
    const form = new FormData(e.currentTarget);
    await updateTransaction(editingItem.id, "expense", {
      title: form.get("title") as string,
      nature: form.get("nature") as string,
      categoryId: form.get("categoryId") as string || undefined,
      notes: form.get("notes") as string || undefined,
    });
    setIsEditSaving(false);
    setEditingItem(null);
    // Refresh to reload allTransactions with updated data
    router.refresh();
    setDrillDown(null);
  }

  function openNatureDrillDown(nature: "essential" | "important" | "superfluous") {
    const labels: Record<string, string> = { essential: "Gastos Essenciais", important: "Gastos Importantes", superfluous: "Gastos Supérfluos" };
    const items = allTransactions.filter((t: any) => t.type === "expense" && t.nature === nature);
    setDrillDown({ title: labels[nature], items });
  }

  function openCategoryDrillDown(categoryName: string) {
    const catId = data.expenseCategories.find((c: any) => c.name === categoryName)?.id;
    const items = allTransactions.filter((t: any) => t.type === "expense" && t.categoryId === catId);
    setDrillDown({ title: `Despesas — ${categoryName}`, items });
  }

  function openAllExpensesDrillDown() {
    const items = allTransactions.filter((t: any) => t.type === "expense" && (t.status === "paid" || t.status === "pending"));
    setDrillDown({ title: "Todas as Saídas do Mês", items });
  }

  function openBalanceDrillDown() {
    // Todas as transações que efetivamente movimentaram o saldo da conta
    const items = allTransactions.filter((t: any) =>
      (t.type === "income" && (t.status === "received" || t.status === "partial")) ||
      (t.type === "expense" && t.status === "paid")
    ).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setDrillDown({ title: "Movimentações que formam o saldo", items });
  }

  // Report states
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  async function loadReportData() {
    if (reportData) return;
    setIsLoadingReport(true);
    try {
      const data = await getReportData(12);
      setReportData(data);
    } catch (e) { console.error(e); }
    setIsLoadingReport(false);
  }

  let computedAmount = "";
  if (isCommission && contractValue && commissionPct) {
    const cv = parseFloat(contractValue.replace(/\./g, "").replace(",", ".") || "0");
    const pct = parseFloat(commissionPct || "0");
    computedAmount = ((cv * pct) / 100).toLocaleString("pt-br", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function handleDelete(id: string, type: "income" | "expense") {
    if (!confirm("Certeza que deseja apagar este lançamento?")) return;
    setDeletingId(id);
    await deleteTransaction(id, type);
    router.refresh();
    setDeletingId(null);
  }

  async function handleMarkPaid(id: string, type: "income" | "expense") {
    setPayingId(id);
    await markTransactionAsPaid(id, type);
    router.refresh();
    setPayingId(null);
  }

  // ── Edit transaction modal ────────────────────────────────────────────────
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [isSavingTx, setIsSavingTx] = useState(false);

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingTx) return;
    setIsSavingTx(true);
    const form = new FormData(e.currentTarget);
    const amountStr = form.get("amount") as string;
    const amountCentavos = amountStr
      ? Math.round(parseFloat(amountStr.replace(/\./g, "").replace(",", ".")) * 100)
      : undefined;
    const dateValue = form.get("date") as string;
    try {
      await updateTransaction(editingTx.id, editingTx.type, {
        title: form.get("title") as string || undefined,
        notes: (form.get("notes") as string) || undefined,
        nature: editingTx.type === "expense" ? (form.get("nature") as string) || undefined : undefined,
        categoryId: editingTx.type === "expense" ? (form.get("categoryId") as string) || undefined : undefined,
        // For incomes: send empty string explicitly so the server can set dueDate = null
        date: editingTx.type === "income" ? dateValue : (dateValue || undefined),
        amount: amountCentavos,
      });
      setEditingTx(null);
      router.refresh();
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar. Tente novamente.");
    } finally {
      setIsSavingTx(false);
    }
  }

  function handleMonthChange(offset: number) {
    let newMonth = currentMonth + offset;
    let newYear = currentYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    else if (newMonth > 11) { newMonth = 0; newYear++; }
    router.push(`/?month=${newMonth}&year=${newYear}`);
  }

  useEffect(() => {
    async function syncTime() {
      setIsSyncing(true);
      try {
        const response = await fetch("https://worldtimeapi.org/api/timezone/America/Sao_Paulo");
        const json = await response.json();
        setLiveTime(new Date(json.datetime));
      } catch (err) { console.warn(err); setLiveTime(new Date()); }
      setIsSyncing(false);
    }
    syncTime();
    const interval = setInterval(() => setLiveTime(prev => new Date(prev.getTime() + 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // Gráfico de Trajetória de Caixa — fluxo acumulado real por dia do mês
  const chartData = (() => {
    const today = new Date();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
    const lastRealDay = isCurrentMonth ? today.getDate() : daysInMonth;

    // Saldo inicial: saldo atual menos o fluxo confirmado do mês
    const totalReceivedThisMonth = allTransactions
      .filter((t: any) => t.type === 'income' && t.status === 'received')
      .reduce((acc: number, t: any) => acc + t.amount, 0);
    const totalPaidThisMonth = allTransactions
      .filter((t: any) => t.type === 'expense' && t.status === 'paid')
      .reduce((acc: number, t: any) => acc + Math.abs(t.amount), 0);
    const startBalance = kpis.accountBalance - totalReceivedThisMonth + totalPaidThisMonth;

    const points: { day: string; actual: number | null; projected: number | null }[] = [];
    let runningBalance = startBalance;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTx = allTransactions.filter((t: any) => t.date.startsWith(dateStr));

      dayTx.forEach((t: any) => {
        if (t.type === 'income' && t.status === 'received') runningBalance += t.amount;
        if (t.type === 'expense' && t.status === 'paid') runningBalance -= Math.abs(t.amount);
      });

      const shortMonth = new Date(currentYear, currentMonth).toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase();
      const label = d === 1 ? `01 ${shortMonth}` :
                   (isCurrentMonth && d === lastRealDay) ? 'HOJE' :
                   (!isCurrentMonth && d === daysInMonth) ? `${String(d).padStart(2,'0')} ${shortMonth}` :
                   d % 7 === 0 ? String(d) : '';

      const isReal = d <= lastRealDay;
      const pendingUntilDay = allTransactions
        .filter((t: any) => {
          const txDay = parseInt(t.date.substring(8, 10));
          return txDay <= d && (t.status === 'pending' || t.status === 'expected');
        })
        .reduce((acc: number, t: any) => acc + t.amount, 0);

      points.push({
        day: label,
        actual: isReal ? parseFloat(runningBalance.toFixed(2)) : null,
        projected: !isReal ? parseFloat((kpis.accountBalance + pendingUntilDay).toFixed(2)) : null,
      });
    }

    return points.filter(p => p.day !== '');
  })();


  async function handleSubmit(e: any) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.target);
    await createTransaction(formData);
    router.refresh();
    setIsSubmitting(false);
    setIsModalOpen(false);
  }

  async function handleSubmitAsset(e: any) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.target);
    await createAsset(formData);
    router.refresh();
    setIsSubmitting(false);
    setIsAssetModalOpen(false);
  }

  async function handleSubmitLiability(e: any) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.target);
    await createLiability(formData);
    router.refresh();
    setIsSubmitting(false);
    setIsLiabilityModalOpen(false);
  }

  async function handleAssetDelete(id: string) {
    if (!confirm("Remover este ativo?")) return;
    await deleteAsset(id);
    router.refresh();
  }

  async function handleLiabilityDelete(id: string) {
    if (!confirm("Remover este passivo?")) return;
    await deleteLiability(id);
    router.refresh();
  }

  async function handleSubmitGoal(e: any) {
    e.preventDefault();
    setIsSubmitting(true);
    await createGoal(new FormData(e.target));
    router.refresh();
    setIsSubmitting(false);
    setIsGoalModalOpen(false);
  }

  async function handleGoalDelete(id: string) {
    if (!confirm("Remover esta meta?")) return;
    await deleteGoal(id);
    router.refresh();
  }

  async function handleUpdateBudget(e: any) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.target);
    await updateCategoryBudget(selectedCategoryId, formData.get("budgetLimit") as string);
    router.refresh();
    setIsSubmitting(false);
    setIsBudgetModalOpen(false);
  }

  return (
    <div className="flex h-screen bg-mesh text-slate-100 font-sans selection:bg-primary/30 overflow-hidden">
      <aside className="w-20 lg:w-64 bg-slate-900/40 backdrop-blur-xl border-r border-white/5 flex flex-col hidden md:flex shrink-0">
        <a href="/" className="h-20 flex items-center px-6 gap-3 group transition-all">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>
          <div className="hidden lg:block truncate">
            <h1 className="text-sm font-black leading-tight tracking-tighter">MINHAS</h1>
            <p className="text-[10px] text-primary uppercase tracking-widest font-black">FINANÇAS</p>
          </div>
        </a>
        <nav className="flex-1 py-6 px-4 space-y-2">
          <NavItem icon="dashboard" label="Painel" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
          <NavItem icon="payments" label="Receitas" active={activeTab === "incomes"} onClick={() => setActiveTab("incomes")} />
          <NavItem icon="receipt_long" label="Despesas" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <NavItem icon="calendar_month" label="Agenda" badge={recentTransactions.filter((r: any) => r.status === 'pending').length.toString()} active={activeTab === "agenda"} onClick={() => setActiveTab("agenda")} />
          <NavItem icon="account_balance" label="Patrimônio" active={activeTab === "patrimony"} onClick={() => setActiveTab("patrimony")} />
          <NavItem icon="target" label="Metas & Tetos" active={activeTab === "metas"} onClick={() => setActiveTab("metas")} />
          <NavItem icon="credit_card" label="Cartões" active={activeTab === "cards"} onClick={() => setActiveTab("cards")} />
          <NavItem icon="bar_chart" label="Relatórios" active={activeTab === "reports"} onClick={() => { setActiveTab("reports"); loadReportData(); }} />
        </nav>
        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="px-4 py-2 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xs uppercase">{data.user?.name?.substring(0, 2)}</div>
            <div className="hidden lg:block">
              <p className="text-[10px] font-black text-white truncate">{data.user?.name}</p>
              <p className="text-[8px] font-bold text-slate-500 truncate">{data.user?.email}</p>
            </div>
          </div>
          <button onClick={() => router.push("/settings")} className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-white/5 transition-all group">
            <span className="material-symbols-outlined text-sm">settings</span>
            <span className="hidden lg:block uppercase tracking-widest font-black">Configurações</span>
          </button>
          <button onClick={() => logoutAction()} className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-bold text-slate-500 hover:text-danger hover:bg-danger/10 transition-all group">
            <span className="material-symbols-outlined text-sm group-hover:text-danger">logout</span>
            <span className="hidden lg:block uppercase tracking-widest font-black">Encerrar Sessão</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 lg:px-10 z-10 w-full shrink-0 bg-slate-900/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors px-3 py-1.5 rounded-lg border border-white/10">
              <span className={`material-symbols-outlined text-sm ${isSyncing ? "animate-spin text-primary" : "text-emerald-500"}`}>{isSyncing ? "sync" : "public"}</span>
              <span className="text-xs font-semibold uppercase tracking-wide">HORA MUNDIAL</span>
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-mono font-bold text-white tabular-nums">{liveTime.toLocaleTimeString("pt-BR")}</span>
            </button>
            <div className="h-8 w-[1px] bg-white/10 mx-2"></div>
            <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
              <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-white/10 rounded transition-colors"><span className="material-symbols-outlined text-sm">chevron_left</span></button>
              <span className="px-3 text-[10px] font-black uppercase tracking-widest text-primary min-w-[120px] text-center">{new Date(currentYear, currentMonth).toLocaleDateString("pt-BR", { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-white/10 rounded transition-colors"><span className="material-symbols-outlined text-sm">chevron_right</span></button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3">
              {(globalSearch || statusFilter !== "all" || categoryFilter) && (
                <button 
                  onClick={() => {
                    setGlobalSearch("");
                    setStatusFilter("all");
                    setCategoryFilter("");
                  }}
                  className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase rounded-lg border border-primary/20 hover:bg-primary/20 transition-all whitespace-nowrap"
                >
                  Limpar Filtros
                </button>
              )}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                <input
                  className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm w-48 lg:w-64 focus:ring-2 focus:ring-primary h-10 outline-none transition-all"
                  placeholder="Buscar transação..."
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                />
              </div>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="bg-primary hover:bg-primary/90 text-white h-10 px-4 rounded-xl text-sm font-bold flex items-center shadow-lg shadow-primary/20 transition-all active:scale-95">
              <span className="material-symbols-outlined mr-2">add</span> Lançamento
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6 lg:p-10 pb-32">
          <div className="max-w-7xl mx-auto space-y-10">
            {activeTab === "dashboard" && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="text-3xl font-black text-white tracking-tight">Olá, {data.user?.name || "Comandante"}</h2>
                  <p className="text-slate-400 text-sm font-medium">Sua inteligência financeira para {new Date(currentYear, currentMonth).toLocaleDateString("pt-BR", { month: 'long' })} está atualizada.</p>
                </div>
                {/* ═══════ SEÇÃO 1: SITUAÇÃO HOJE ═══════ */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 ml-1">📍 Situação Atual</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <KpiCard
                      title="Dinheiro no Banco"
                      titleTooltip="Clique para ver todas as movimentações que formam este saldo"
                      value={`R$ ${kpis.accountBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                      trend="Saldo atual em conta"
                      icon="account_balance"
                      color="primary"
                      onClick={() => openBalanceDrillDown()}
                    />
                    <KpiCard 
                      title="Falta da Empresa" 
                      titleTooltip="Diferença entre seu salário e os custos fixos já pagos"
                      value={`R$ ${kpis.estimatedFreeBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
                      trend="Salário − Fixos = Saldo Livre" 
                      icon="business_center" 
                      color="warning" 
                    />
                    <KpiCard 
                      title="Projeção Final" 
                      titleTooltip="Saldo Hoje + Tudo que falta entrar − Tudo que falta pagar"
                      value={`R$ ${kpis.projectedBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
                      trend="Se receber tudo e pagar tudo" 
                      icon="query_stats" 
                      color={kpis.projectedBalance >= 0 ? "success" : "danger"}
                      onClick={() => {
                        setActiveTab("agenda");
                        setStatusFilter("pending");
                        setGlobalSearch("");
                      }}
                    />
                  </div>
                </div>

                {/* ═══════ SEÇÃO 2: FLUXO DO MÊS ═══════ */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 ml-1">💸 Fluxo do Mês</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* ENTRADAS */}
                    <div 
                      onClick={() => { setActiveTab("incomes"); setStatusFilter("all"); setGlobalSearch(""); }}
                      className="relative group overflow-hidden bg-gradient-to-br from-emerald-500/10 to-slate-900/80 backdrop-blur-xl border border-emerald-500/20 rounded-[2rem] p-6 shadow-2xl cursor-pointer hover:border-emerald-500/40 transition-all active:scale-[0.99]"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full -z-10"></div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Entradas do Mês</h3>
                        <div className="p-2.5 rounded-xl bg-emerald-500/20"><span className="material-symbols-outlined text-xl text-emerald-500">trending_up</span></div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/70">Já Recebido</div>
                          <div className="text-2xl font-black text-white">R$ {kpis.actualIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[9px] text-slate-500 font-medium">Salário + adiantamentos já no banco</div>
                        </div>
                        <div className="border-t border-white/5 pt-3">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-amber-500/70">Falta Receber</div>
                          <div className="text-lg font-black text-amber-400">R$ {kpis.remainingIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[9px] text-slate-500 font-medium">Comissões + dívidas pendentes</div>
                        </div>
                      </div>
                    </div>

                    {/* SAÍDAS */}
                    <div
                      onClick={() => openAllExpensesDrillDown()}
                      className="relative group overflow-hidden bg-gradient-to-br from-rose-500/10 to-slate-900/80 backdrop-blur-xl border border-rose-500/20 rounded-[2rem] p-6 shadow-2xl cursor-pointer hover:border-rose-500/40 transition-all active:scale-[0.99]"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-bl-full -z-10"></div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Saídas do Mês</h3>
                        <div className="p-2.5 rounded-xl bg-rose-500/20"><span className="material-symbols-outlined text-xl text-rose-500">trending_down</span></div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-rose-500/70">Já Pago</div>
                          <div className="text-2xl font-black text-white">R$ {kpis.paidExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[9px] text-slate-500 font-medium">Aluguel, condomínio, energia, gastos diversos</div>
                        </div>
                        {kpis.pendingExpense > 0 && (
                          <div className="border-t border-white/5 pt-3">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-rose-400/70">Ainda Pendente</div>
                            <div className="text-lg font-black text-rose-400">R$ {kpis.pendingExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            <div className="text-[9px] text-slate-500 font-medium">Contas ainda não quitadas</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══════ SEÇÃO 2.5: SALÁRIO A RECEBER DA EMPRESA ═══════ */}
                {kpis.pendingSalaryBalance > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 ml-1">💼 Empresa te Deve</h3>
                    <div
                      onClick={() => {
                        setActiveTab("incomes");
                        setStatusFilter("all");
                        setGlobalSearch("Salário");
                      }}
                      className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-warning/20 to-slate-900 border border-warning/20 p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 transition-all hover:border-warning/40 shadow-2xl cursor-pointer active:scale-[0.99]"
                    >
                      <div className="absolute top-0 right-0 w-64 h-64 bg-warning/10 blur-[100px] -z-10 group-hover:bg-warning/20 transition-colors"></div>
                      <div>
                        <h2 className="text-2xl font-black text-white flex items-center tracking-tight">
                          <span className="material-symbols-outlined text-warning text-3xl mr-3">account_balance_wallet</span>
                          Salário a Receber
                        </h2>
                        <p className="text-slate-400 text-sm mt-2 font-medium">
                          Saldo acumulado de salário que a empresa ainda te deve.<br/>
                          <span className="text-warning/80 text-xs">Clique para ver os meses em aberto.</span>
                        </p>
                      </div>
                      <div className="bg-white/5 border border-warning/20 rounded-2xl px-8 py-5 backdrop-blur-md shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-warning">Total Acumulado</span>
                        <div className="text-4xl font-black text-white mt-1">R$ {kpis.pendingSalaryBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════ SEÇÃO 3: COMISSÕES ═══════ */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 ml-1">🎯 Comissões</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {kpis.pendingCommissions > 0 && (
                      <div 
                        onClick={() => {
                          setActiveTab("incomes");
                          setGlobalSearch("Comiss");
                          setStatusFilter("all");
                        }}
                        className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 to-slate-900 border border-primary/20 p-8 flex flex-col justify-between gap-6 transition-all hover:border-primary/40 shadow-2xl cursor-pointer active:scale-[0.99]"
                      >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] -z-10 group-hover:bg-primary/30 transition-colors"></div>
                        <div>
                          <h2 className="text-2xl font-black text-white flex items-center tracking-tight"><span className="material-symbols-outlined text-primary text-3xl mr-3">target</span>Comissões no Radar</h2>
                          <p className="text-slate-400 text-sm mt-2 max-w-md font-medium">Total de comissões que você tem a receber de todos os clientes.</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 backdrop-blur-md self-start">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">A Receber Total</span>
                          <div className="text-3xl font-black text-white mt-1">R$ {kpis.pendingCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                    )}

                    <div 
                      onClick={() => {
                        setTxType("comm_receipt");
                        setIsModalOpen(true);
                      }}
                      className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/20 to-slate-900 border border-emerald-500/20 p-8 flex flex-col justify-between gap-6 transition-all hover:border-emerald-500/40 shadow-2xl cursor-pointer active:scale-[0.99]"
                    >
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] -z-10 group-hover:bg-emerald-500/20 transition-colors"></div>
                      <div>
                        <div className="flex justify-between items-start">
                          <h2 className="text-2xl font-black text-white flex items-center tracking-tight"><span className="material-symbols-outlined text-emerald-500 text-3xl mr-3">check_circle</span>Comissões Recebidas</h2>
                          <button className="bg-emerald-500 text-white p-2 rounded-xl group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/20">
                            <span className="material-symbols-outlined">add_circle</span>
                          </button>
                        </div>
                        <p className="text-slate-400 text-sm mt-2 max-w-md font-medium">Clique para lançar novos recebimentos de comissão.</p>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 backdrop-blur-md self-start">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Recebido no Mês</span>
                        <div className="text-3xl font-black text-white mt-1">R$ {(kpis.receivedCommissionsThisMonth || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-xl">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-10"><span className="material-symbols-outlined text-primary">distance</span>Trajetória de Caixa</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs><linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#135bec" stopOpacity={0.3} /><stop offset="95%" stopColor="#135bec" stopOpacity={0} /></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }} dy={15} />
                          <YAxis hide />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }} itemStyle={{ color: '#fff', fontWeight: 'bold' }} />
                          <Area type="monotone" dataKey="actual" stroke="#135bec" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" connectNulls />
                          <Area type="monotone" dataKey="projected" stroke="rgba(255,255,255,0.2)" strokeWidth={2} strokeDasharray="8 8" fill="none" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 flex flex-col shadow-xl">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                      <span className="material-symbols-outlined text-primary">donut_large</span>
                      Qualidade do Gasto
                    </h3>
                    <div className="h-[200px] w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Essencial', value: data.spentByNature.essential, color: '#10b981' },
                              { name: 'Importante', value: data.spentByNature.important, color: '#f59e0b' },
                              { name: 'Supérfluo', value: data.spentByNature.superfluous, color: '#f43f5e' },
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={8}
                            dataKey="value"
                          >
                            {[
                              { name: 'Essencial', color: '#10b981' },
                              { name: 'Importante', color: '#f59e0b' },
                              { name: 'Supérfluo', color: '#f43f5e' },
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                            itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                            formatter={(value: any) => `R$ ${parseFloat(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                      {[
                        { label: "Essencial", key: "essential" as const, color: "text-success", value: data.spentByNature.essential },
                        { label: "Importante", key: "important" as const, color: "text-warning", value: data.spentByNature.important },
                        { label: "Supérfluo", key: "superfluous" as const, color: "text-danger", value: data.spentByNature.superfluous },
                      ].map(({ label, key, color, value }) => {
                        const total = data.spentByNature.essential + data.spentByNature.important + data.spentByNature.superfluous || 1;
                        return (
                          <button key={key} onClick={() => openNatureDrillDown(key)} className="w-full flex justify-between items-center text-[10px] font-black uppercase hover:bg-white/5 px-2 py-1.5 rounded-lg transition-all group">
                            <span className={`${color} flex items-center gap-1`}>{label} <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-60">open_in_new</span></span>
                            <span className="text-white">R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} <span className="text-slate-500">({Math.round((value / total) * 100)}%)</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 flex flex-col shadow-xl">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-8">Movimentações Recentes</h3>
                  <div className="space-y-4">
                    {recentTransactions.length === 0 ? <div className="text-sm text-slate-500 text-center py-20 italic">Centro sem comando.</div> : recentTransactions.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.08] transition-all group">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            t.isDebtRecovery ? 'bg-primary/10 text-primary' :
                            t.type === 'income' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                          }`}>
                            <span className="material-symbols-outlined text-xl">{t.isDebtRecovery ? 'handshake' : t.type === 'income' ? 'add' : 'remove'}</span>
                          </div>
                          <div className="max-w-[200px]"><p className="text-sm font-bold text-white truncate">{t.name}</p><p className="text-[10px] text-slate-500 font-bold uppercase">{t.displayDate}</p></div>
                        </div>
                        <p className={`text-sm font-black ${t.type === 'income' ? 'text-success' : 'text-white'}`}>{t.type === 'income' ? '+' : '-'} {Math.abs(t.amount).toLocaleString('pt-BR')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {(activeTab === "incomes" || activeTab === "expenses") && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">{activeTab === "incomes" ? "Portfólio de Receitas" : "Centro de Despesas"}</h2>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-slate-300 outline-none focus:border-primary"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">Todos os Status</option>
                      {activeTab === "incomes" ? (
                        <>
                          <option value="expected">Pendente</option>
                          <option value="received">Recebido</option>
                        </>
                      ) : (
                        <>
                          <option value="pending">Pendente</option>
                          <option value="paid">Pago</option>
                        </>
                      )}
                    </select>
                    <select
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-slate-300 outline-none focus:border-primary"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                      <option value="">Todos os Tipos / Categorias</option>
                      {activeTab === "incomes"
                        ? data.incomeSources.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)
                        : (
                          <>
                            <optgroup label="Categorias">
                              {data.expenseCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                            <optgroup label="Natureza">
                              <option value="essential">Essencial</option>
                              <option value="important">Importante</option>
                              <option value="superfluous">Supérfluo</option>
                            </optgroup>
                          </>
                        )
                      }
                    </select>
                  </div>
                </div>
                {activeTab === "incomes" ? (
                  // ── PORTFÓLIO DE RECEITAS — com separação A Receber / Recebido ──
                  (() => {
                    const filtered = allTransactions.filter((t: any) => {
                      const matchesType = t.type === "income";
                      const matchesSearch = !globalSearch || t.name.toLowerCase().includes(globalSearch.toLowerCase()) || (t.notes && t.notes.toLowerCase().includes(globalSearch.toLowerCase()));
                      const matchesCategory = !categoryFilter || t.incomeSourceId === categoryFilter;
                      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
                      return matchesType && matchesSearch && matchesCategory && matchesStatus;
                    });

                    const pending = filtered.filter((t: any) => t.status !== "received");
                    const received = filtered.filter((t: any) => t.status === "received");

                    if (filtered.length === 0) return (
                      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2rem] p-16 text-center text-slate-500 font-medium shadow-2xl">
                        Nenhum registro encontrado para este filtro.
                      </div>
                    );

                    const totalPending = pending.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
                    const totalReceived = received.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
                    const totalAll = totalPending + totalReceived;
                    const receivedPct = totalAll > 0 ? (totalReceived / totalAll) * 100 : 0;

                    return (
                      <div className="space-y-6">
                        {/* ── Painel de resumo ── */}
                        <div className="bg-slate-900/60 border border-white/5 rounded-[2rem] p-6 shadow-2xl">
                          <div className="grid grid-cols-3 gap-4 mb-5">
                            {/* Total geral */}
                            <div className="col-span-3 sm:col-span-1 flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total do período</span>
                              <span className="text-3xl font-black text-white tracking-tighter">
                                R$ {totalAll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-slate-600">{filtered.length} lançamento{filtered.length !== 1 ? 's' : ''}</span>
                            </div>
                            {/* A receber */}
                            <div className="flex flex-col gap-1 border-l border-white/5 pl-4">
                              <span className="text-[10px] font-black uppercase tracking-widest text-warning">A Receber</span>
                              <span className="text-2xl font-black text-warning tracking-tighter">
                                R$ {totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-slate-600">{pending.length} pendente{pending.length !== 1 ? 's' : ''}</span>
                            </div>
                            {/* Recebido */}
                            <div className="flex flex-col gap-1 border-l border-white/5 pl-4">
                              <span className="text-[10px] font-black uppercase tracking-widest text-success">Recebido</span>
                              <span className="text-2xl font-black text-success tracking-tighter">
                                R$ {totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-slate-600">{received.length} liquidado{received.length !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          {/* Barra de progresso */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                              <span>Progresso de recebimento</span>
                              <span>{receivedPct.toFixed(0)}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-success rounded-full transition-all duration-700"
                                style={{ width: `${receivedPct}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Seção A Receber */}
                        {(statusFilter === "all" || statusFilter === "expected") && pending.length > 0 && (
                          <div>
                            <div className="flex items-center gap-3 mb-3 px-1">
                              <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-warning">A Receber</span>
                              <span className="text-[10px] font-bold text-slate-600 ml-auto">
                                R$ {pending.reduce((s: number, t: any) => s + Math.abs(t.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="bg-slate-900/40 backdrop-blur-xl border border-warning/10 rounded-[2rem] overflow-hidden shadow-2xl">
                              <div className="p-6 space-y-4">
                                {pending.map((t: any) => (
                                  <TransactionRow key={t.id} t={t} payingId={payingId} deletingId={deletingId} handleMarkPaid={handleMarkPaid} handleDelete={handleDelete} onEdit={setEditingTx} />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Seção Recebido */}
                        {(statusFilter === "all" || statusFilter === "received") && received.length > 0 && (
                          <div>
                            <div className="flex items-center gap-3 mb-3 px-1">
                              <div className="w-2 h-2 rounded-full bg-success"></div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-success">Recebido</span>
                              <span className="text-[10px] font-bold text-slate-600 ml-auto">
                                R$ {received.reduce((s: number, t: any) => s + Math.abs(t.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="bg-slate-900/40 backdrop-blur-xl border border-success/10 rounded-[2rem] overflow-hidden shadow-2xl">
                              <div className="p-6 space-y-4">
                                {received.map((t: any) => (
                                  <TransactionRow key={t.id} t={t} payingId={payingId} deletingId={deletingId} handleMarkPaid={handleMarkPaid} handleDelete={handleDelete} onEdit={setEditingTx} />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  // ── CENTRO DE DESPESAS — lista simples ──
                  <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                    <div className="p-8 space-y-4">
                      {(() => {
                        const filtered = allTransactions.filter((t: any) => {
                          const matchesType = t.type === "expense";
                          const matchesSearch = !globalSearch || t.name.toLowerCase().includes(globalSearch.toLowerCase()) || (t.notes && t.notes.toLowerCase().includes(globalSearch.toLowerCase()));
                          const matchesCategory = !categoryFilter || t.categoryId === categoryFilter || t.nature === categoryFilter;
                          const matchesStatus = statusFilter === "all" || t.status === statusFilter;
                          return matchesType && matchesSearch && matchesCategory && matchesStatus;
                        });

                        if (filtered.length === 0) return <div className="py-20 text-center text-slate-500 font-medium">Nenhum registro encontrado para este filtro.</div>;

                        return filtered.map((t: any) => (
                          <TransactionRow key={t.id} t={t} payingId={payingId} deletingId={deletingId} handleMarkPaid={handleMarkPaid} handleDelete={handleDelete} onEdit={setEditingTx} />
                        ));
                      })()}
                    </div>
                  </div>
                )}
                {activeTab === "incomes" && data.futureCommissions?.length > 0 && (
                  <div className="animate-in fade-in slide-in-from-top-4 space-y-6 pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                        <span className="material-symbols-outlined text-primary text-xl">radar</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white tracking-tight">Radar de Comissões Futuras</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Projeção estimada de recebimentos para os próximos meses</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {data.futureCommissions.map((fc: any, i: number) => (
                        <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] transition-all group overflow-hidden relative">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 truncate">{fc.label}</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs font-bold text-slate-400">R$</span>
                            <span className="text-xl font-black text-white">{fc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "agenda" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight leading-none uppercase">Calendário do Comandante</h2>
                    <p className="text-slate-400 text-sm font-medium mt-2">Visão tática de fluxo de caixa por dia.</p>
                  </div>
                  <div className="flex items-center bg-white/5 rounded-2xl border border-white/10 p-1 backdrop-blur-md">
                    <div className="px-4 text-xs font-black uppercase text-primary border-r border-white/10 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success"></div> Receitas
                    </div>
                    <div className="px-4 text-xs font-black uppercase text-danger flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-danger"></div> Despesas
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl p-4 lg:p-8">
                  <div className="grid grid-cols-7 mb-4">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => (
                      <div key={day} className="text-center text-[10px] font-black uppercase tracking-widest text-slate-500 py-4">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 lg:gap-3">
                    {(() => {
                      const monthStart = startOfMonth(new Date(currentYear, currentMonth));
                      const monthEnd = endOfMonth(monthStart);
                      const startDate = startOfWeek(monthStart);
                      const endDate = endOfWeek(monthEnd);
                      const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

                        return calendarDays.map((day, idx) => {
                          const dateStr = format(day, "yyyy-MM-dd");
                          const dayTx = allTransactions.filter((t: any) => t.date.startsWith(dateStr));
                        const isSelectedMonth = isSameMonth(day, monthStart);
                        const isCurrentDay = isToday(day);

                        return (
                          <div key={idx} className={`min-h-[100px] lg:min-h-[140px] rounded-2xl border transition-all p-2 lg:p-3 flex flex-col gap-1.5 ${isSelectedMonth ? 'bg-white/[0.03] border-white/5' : 'opacity-20 border-transparent'} ${isCurrentDay ? 'border-primary/50 shadow-[0_0_20px_rgba(19,91,236,0.15)] bg-primary/5' : ''} hover:bg-white/[0.08] hover:border-white/10`}>
                            <div className="flex justify-between items-center px-1">
                              <span className={`text-xs font-black ${isCurrentDay ? 'text-primary' : isSelectedMonth ? 'text-slate-400' : 'text-slate-600'}`}>{format(day, "d")}</span>
                              {dayTx.length > 0 && isSelectedMonth && <span className="text-[10px] font-black text-white/20">{dayTx.length} items</span>}
                            </div>

                            <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-0.5">
                              {dayTx.map((t: any) => (
                                <div key={t.id} className={`px-2 py-1 rounded-lg text-[9px] font-bold leading-tight flex items-center justify-between gap-1 ${t.type === 'income' ? 'bg-success/20 text-success border border-success/20' : 'bg-danger/20 text-white/90 border border-danger/20'} ${t.status === 'paid' || t.status === 'received' ? 'opacity-40 grayscale-[0.5]' : ''}`}>
                                  <span className="truncate">R${Math.abs(t.amount).toLocaleString('pt-BR')} {t.name}</span>
                                  {t.attachmentUrl && <span className="material-symbols-outlined text-[10px] shrink-0">description</span>}
                                </div>
                              ))}
                            </div>

                            {dayTx.length > 0 && isSelectedMonth && (
                              <div className="mt-auto pt-1 flex flex-col gap-0.5 border-t border-white/5">
                                {dayTx.filter((t: any) => t.type === 'income').length > 0 && (
                                  <div className="text-[8px] font-black text-success uppercase text-right tracking-tighter cursor-default">
                                    + R$ {dayTx.filter((t: any) => t.type === 'income').reduce((acc: any, curr: any) => acc + curr.amount, 0).toLocaleString('pt-BR')}
                                  </div>
                                )}
                                {dayTx.filter((t: any) => t.type === 'expense').length > 0 && (
                                  <div className="text-[8px] font-black text-danger uppercase text-right tracking-tighter cursor-default">
                                    - R$ {Math.abs(dayTx.filter((t: any) => t.type === 'expense').reduce((acc: any, curr: any) => acc + curr.amount, 0)).toLocaleString('pt-BR')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "patrimony" && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">Gestão de Patrimônio</h2>
                    <p className="text-slate-400 text-sm font-medium mt-1">Sua posição líquida real consolidada.</p>
                  </div>
                  <div className="flex bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Patrimônio Líquido</span>
                      <div className={`text-4xl font-black mt-1 ${kpis.netWorth >= 0 ? "text-white" : "text-danger"}`}>
                        R$ {kpis.netWorth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="flex justify-between items-center px-2">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-success">account_balance</span>
                        Meus Ativos (Bens)
                      </h3>
                      <button onClick={() => setIsAssetModalOpen(true)} className="text-xs font-black uppercase tracking-widest text-primary hover:text-white transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">add</span> Adicionar Ativo
                      </button>
                    </div>

                    <div className="space-y-4">
                      {data.assets?.length === 0 ? (
                        <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center text-slate-500 italic">Nenhum ativo declarado.</div>
                      ) : data.assets.map((a: any) => (
                        <div key={a.id} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex justify-between items-center group">
                          <div>
                            <p className="text-sm font-black text-white">{a.name}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{a.type}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-lg font-black text-success">R$ {(a.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <button onClick={() => handleAssetDelete(a.id)} className="w-8 h-8 rounded-lg bg-danger/10 text-danger opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-danger hover:text-white">
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex justify-between items-center px-2">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-danger">account_balance</span>
                        Meus Passivos (Dívidas)
                      </h3>
                      <button onClick={() => setIsLiabilityModalOpen(true)} className="text-xs font-black uppercase tracking-widest text-primary hover:text-white transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">add</span> Adicionar Passivo
                      </button>
                    </div>

                    <div className="space-y-4">
                      {data.liabilities?.length === 0 ? (
                        <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center text-slate-500 italic">Nenhuma dívida declarada.</div>
                      ) : data.liabilities.map((l: any) => (
                        <div key={l.id} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 flex justify-between items-center group">
                          <div>
                            <p className="text-sm font-black text-white">{l.name}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{l.type}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="block text-lg font-black text-white">R$ {(l.outstandingAmount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              <span className="block text-[10px] text-slate-500 font-bold">PAGAMENTO MENSAL: R$ {(l.monthlyPayment / 100).toLocaleString('pt-BR')}</span>
                            </div>
                            <button onClick={() => handleLiabilityDelete(l.id)} className="w-8 h-8 rounded-lg bg-danger/10 text-danger opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-danger hover:text-white">
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "metas" && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">Estratégia & Objetivos</h2>
                    <p className="text-slate-400 text-sm font-medium mt-1">Transforme seu caixa em sonhos realizados.</p>
                  </div>
                  <button onClick={() => setIsGoalModalOpen(true)} className="bg-primary text-white h-12 px-6 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center shadow-lg shadow-primary/20 hover:scale-105 transition-all">
                    <span className="material-symbols-outlined mr-2">add_task</span> Nova Meta
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 px-2">
                      <span className="material-symbols-outlined text-primary">emoji_events</span>
                      Metas de Acúmulo
                    </h3>
                    <div className="space-y-4">
                      {data.goals?.length === 0 ? (
                        <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center text-slate-500 italic">Nenhuma meta tática definida ainda.</div>
                      ) : data.goals.map((goal: any) => {
                        const percent = Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100);
                        return (
                          <div key={goal.id} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 group">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h4 className="font-bold text-white">{goal.title}</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Alvo: R$ {(goal.targetAmount / 100).toLocaleString('pt-BR')} • Prazo: {new Date(goal.targetDate).toLocaleDateString('pt-BR')}</p>
                              </div>
                              <button onClick={() => handleGoalDelete(goal.id)} className="text-slate-500 hover:text-danger opacity-0 group-hover:opacity-100 transition-all">
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </div>
                            <div className="flex justify-between items-end mb-2">
                              <span className={`text-sm font-black ${percent >= 100 ? 'text-success' : 'text-primary'}`}>{percent}%</span>
                              <span className="text-xs font-bold text-slate-300">R$ {(goal.currentAmount / 100).toLocaleString('pt-BR')} / R$ {(goal.targetAmount / 100).toLocaleString('pt-BR')}</span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-4">
                              <div className={`h-full transition-all duration-1000 ${percent >= 100 ? 'bg-success shadow-[0_0_10px_#10b981]' : 'bg-primary shadow-[0_0_10px_#135bec]'}`} style={{ width: `${percent}%` }}></div>
                            </div>
                            {percent < 100 && (
                              <form onSubmit={(e: any) => {
                                e.preventDefault();
                                updateGoalProgress(goal.id, e.target.amount.value);
                                e.target.reset();
                                router.refresh();
                              }} className="flex gap-2">
                                <input name="amount" placeholder="Valor p/ alocar..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-primary" />
                                <button type="submit" className="bg-white/10 hover:bg-primary hover:text-white px-3 rounded-lg text-[10px] font-black uppercase transition-all">Alocar</button>
                              </form>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 px-2">
                      <span className="material-symbols-outlined text-danger">rule</span>
                      Tetos de Gastos (Monthly Budgets)
                    </h3>
                    <div className="space-y-4">
                      {data.budgetStatus?.length === 0 ? (
                        <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center text-slate-500 italic">Configure limites nas suas categorias de despesa.</div>
                      ) : data.budgetStatus.map((budget: any) => (
                        <div key={budget.id} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 group cursor-pointer hover:border-white/10 transition-all">
                          <div className="flex justify-between items-center mb-4">
                            <h4 onClick={() => openCategoryDrillDown(budget.name)} className="font-bold text-white flex items-center gap-2 hover:text-primary transition-colors">
                              <span className="material-symbols-outlined text-xs text-slate-500">category</span>
                              {budget.name}
                              <span className="material-symbols-outlined text-[10px] text-slate-600 group-hover:text-primary transition-colors">open_in_new</span>
                            </h4>
                            <span onClick={() => { setSelectedCategoryId(budget.id); setIsBudgetModalOpen(true); }} className={`text-[10px] font-black px-2 py-0.5 rounded cursor-pointer hover:opacity-80 ${budget.percent > 90 ? 'bg-danger/20 text-danger' : budget.percent > 70 ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'}`}>
                              {budget.percent > 100 ? 'ESTOURADO' : `${Math.round(budget.percent)}%`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-3">
                            <div className={`h-full transition-all duration-1000 ${budget.percent > 100 ? 'bg-danger' : budget.percent > 80 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${Math.min(budget.percent, 100)}%` }}></div>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <span>Gasto: R$ {budget.spent.toLocaleString('pt-BR')}</span>
                            <span>Limite: R$ {budget.limit.toLocaleString('pt-BR')}</span>
                          </div>
                        </div>
                      ))}
                      <div className="p-4 rounded-2xl bg-white/5 border border-dashed border-white/10 text-center">
                        <select className="bg-transparent text-xs font-black uppercase text-slate-400 outline-none cursor-pointer" onChange={(e) => { if (e.target.value) { setSelectedCategoryId(e.target.value); setIsBudgetModalOpen(true); e.target.value = ""; } }}>
                          <option value="">Definir Novo Teto em Categoria...</option>
                          {data.expenseCategories.filter((cat: any) => !data.budgetStatus.find((b: any) => b.id === cat.id)).map((cat: any) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── CARTÕES ────────────────────────────────────────────────── */}
            {activeTab === "cards" && (
              <div className="space-y-6 pb-32 md:pb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Cartões de Crédito</h2>
                    <p className="text-slate-500 text-sm mt-1">{data.cards.length} cartão(ões) cadastrado(s)</p>
                  </div>
                  <button onClick={() => setIsCardModalOpen(true)} className="flex items-center gap-2 h-10 px-5 bg-primary rounded-xl text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition-all shadow-lg shadow-primary/20">
                    <span className="material-symbols-outlined text-sm">add</span>
                    <span className="hidden sm:block">Novo Cartão</span>
                  </button>
                </div>

                {data.cards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-5xl text-slate-700 mb-4">credit_card</span>
                    <p className="text-slate-400 font-bold">Nenhum cartão cadastrado.</p>
                    <p className="text-slate-600 text-sm mt-1">Adicione seus cartões para associar despesas a eles.</p>
                    <button onClick={() => setIsCardModalOpen(true)} className="mt-6 px-6 py-3 bg-primary rounded-xl text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition-all">
                      Adicionar Cartão
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.cards.map((card: any) => (
                      <div key={card.id} className="relative bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-3xl p-6 overflow-hidden group">
                        {/* Decorative circle */}
                        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-primary/10 pointer-events-none" />
                        <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-white/3 pointer-events-none" />

                        <div className="relative">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.brand}</p>
                              <h3 className="text-lg font-black text-white mt-0.5">{card.name}</h3>
                            </div>
                            <span className="material-symbols-outlined text-3xl text-primary/60">credit_card</span>
                          </div>

                          <div className="space-y-2 mb-5">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-bold uppercase tracking-widest">Limite</span>
                              <span className="text-white font-black">R$ {card.limitAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-bold uppercase tracking-widest">Fechamento</span>
                              <span className="text-white font-black">Dia {card.closingDay}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-bold uppercase tracking-widest">Vencimento</span>
                              <span className="text-white font-black">Dia {card.dueDay}</span>
                            </div>
                            {card.accountName && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500 font-bold uppercase tracking-widest">Conta</span>
                                <span className="text-primary font-black">{card.accountName}</span>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handleDeleteCard(card.id)}
                            className="w-full py-2 rounded-xl bg-white/5 hover:bg-danger/10 hover:text-danger text-slate-500 text-xs font-black uppercase tracking-widest transition-all border border-white/5 hover:border-danger/20"
                          >
                            Remover Cartão
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── RELATÓRIOS ─────────────────────────────────────────────── */}
            {activeTab === "reports" && (
              <div className="space-y-8 pb-32 md:pb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Relatórios & Insights</h2>
                    <p className="text-slate-500 text-sm mt-1">Análise dos últimos 12 meses</p>
                  </div>
                </div>

                {isLoadingReport && (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                      <span className="material-symbols-outlined text-5xl text-primary animate-pulse">bar_chart</span>
                      <p className="text-slate-400 mt-4 font-bold">Carregando seus dados...</p>
                    </div>
                  </div>
                )}

                {!isLoadingReport && !reportData && (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                      <span className="material-symbols-outlined text-5xl text-slate-600">bar_chart</span>
                      <p className="text-slate-400 mt-4">Nenhum dado disponível ainda.</p>
                    </div>
                  </div>
                )}

                {!isLoadingReport && reportData && (
                  <>
                    {/* Cards resumo */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Receita Média/Mês</p>
                        <p className="text-xl font-black text-success">R$ {reportData.averageMonthlyIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Despesa Média/Mês</p>
                        <p className="text-xl font-black text-danger">R$ {reportData.averageMonthlyExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      {reportData.bestMonth && (
                        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">🏆 Melhor Mês</p>
                          <p className="text-sm font-black text-white">{reportData.bestMonth.label}</p>
                          <p className="text-lg font-black text-success">+R$ {reportData.bestMonth.net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                      {reportData.worstMonth && (
                        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">⚠️ Pior Mês</p>
                          <p className="text-sm font-black text-white">{reportData.worstMonth.label}</p>
                          <p className="text-lg font-black text-danger">R$ {reportData.worstMonth.net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                    </div>

                    {/* Gráfico receita vs despesa mensal */}
                    {reportData.monthlySummary.length > 0 && (
                      <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">📊 Receita vs Despesa por Mês</h3>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={reportData.monthlySummary} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => v.split(' ')[0].substring(0, 3)} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                            <Tooltip
                              contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                              formatter={(value: number | undefined) => [`R$ ${(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', color: '#64748b' }} />
                            <Bar dataKey="income" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expenses" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Gastos por categoria */}
                      {reportData.categoryBreakdown.length > 0 && (
                        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6">
                          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">🗂️ Gastos por Categoria</h3>
                          <div className="space-y-3">
                            {reportData.categoryBreakdown.slice(0, 8).map((cat, i) => (
                              <div key={i}>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                  <span className="text-white">{cat.name}</span>
                                  <span className="text-slate-400">R$ {cat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span className="text-slate-600">({cat.percentage}%)</span></span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${cat.percentage}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Receita por fonte */}
                      {reportData.incomeBySource.length > 0 && (
                        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6">
                          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">💰 Receita por Fonte</h3>
                          <div className="space-y-3">
                            {reportData.incomeBySource.map((src, i) => (
                              <div key={i}>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                  <span className="text-white">{src.source}</span>
                                  <span className="text-slate-400">R$ {src.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span className="text-slate-600">({src.percentage}%)</span></span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-success rounded-full" style={{ width: `${src.percentage}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Top 10 maiores despesas */}
                    {reportData.topExpenses.length > 0 && (
                      <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">🔥 Top 10 Maiores Despesas</h3>
                        <div className="space-y-2">
                          {reportData.topExpenses.map((exp, i) => (
                            <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black text-slate-600 w-5">#{i + 1}</span>
                                <div>
                                  <p className="text-sm font-bold text-white">{exp.title}</p>
                                  <p className="text-[10px] text-slate-500">{exp.date}</p>
                                </div>
                              </div>
                              <span className="text-sm font-black text-danger">R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Taxa de poupança por mês */}
                    {reportData.monthlySummary.length > 0 && (
                      <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">💾 Taxa de Poupança por Mês</h3>
                        <ResponsiveContainer width="100%" height={180}>
                          <AreaChart data={reportData.monthlySummary}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => v.split(' ')[0].substring(0, 3)} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                            <Tooltip
                              contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                              formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)}%`, 'Poupança']}
                            />
                            <Area type="monotone" dataKey="savingsRate" name="Taxa de Poupança" stroke="#a855f7" fill="rgba(168,85,247,0.15)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <nav className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center justify-around px-2 z-[100] shadow-2xl shadow-black">
          <MobileNavItem icon="dashboard" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
          <MobileNavItem icon="payments" active={activeTab === "incomes"} onClick={() => setActiveTab("incomes")} />
          <MobileNavItem icon="receipt_long" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <MobileNavItem icon="calendar_month" active={activeTab === "agenda"} onClick={() => setActiveTab("agenda")} />
          <MobileNavItem icon="account_balance" active={activeTab === "patrimony"} onClick={() => setActiveTab("patrimony")} />
          <MobileNavItem icon="target" active={activeTab === "metas"} onClick={() => setActiveTab("metas")} />
          <MobileNavItem icon="credit_card" active={activeTab === "cards"} onClick={() => setActiveTab("cards")} />
          <MobileNavItem icon="bar_chart" active={activeTab === "reports"} onClick={() => { setActiveTab("reports"); loadReportData(); }} />
        </nav>
      </main>
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Novo Lançamento</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSubmit} className="p-0 space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 bg-white/5 p-1 rounded-xl">
                <button type="button" onClick={() => setTxType("income")} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${txType === 'income' ? 'bg-success text-white shadow-lg shadow-success/20' : 'text-slate-500 hover:text-white'}`}>Receita</button>
                <button type="button" onClick={() => setTxType("comm_receipt")} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all leading-tight ${txType === "comm_receipt" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-500 hover:text-white"}`}>Receb. Comis.</button>
                <button type="button" onClick={() => setTxType("debt")} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all leading-tight ${txType === 'debt' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-white'}`}>Receb. Dívida</button>
                <button type="button" onClick={() => setTxType("expense")} className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${txType === 'expense' ? 'bg-danger text-white shadow-lg shadow-danger/20' : 'text-slate-500 hover:text-white'}`}>Despesa</button>
              </div>
              {/* Quando for dívida ou recebimento de comissão, enviamos type=income ao backend */}
              <input type="hidden" name="type" value={(txType === 'debt' || txType === 'comm_receipt') ? 'income' : txType} />
              <input type="hidden" name="isCommissionReceipt" value={txType === 'comm_receipt' ? 'true' : 'false'} />
              <div className="space-y-4">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Descrição</label>
                  <input
                    required
                    name="title"
                    list="suggestions"
                    defaultValue={txType === 'comm_receipt' ? 'Recebimento de Comissão' : ''}
                    placeholder="Ex: Aluguel, Supermercado, Netflix..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all"
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase();
                      if (txType === "expense") {
                        // Se o usuário digitar algo que bate com uma subcategoria, seleciona a categoria automaticamente
                        const matchedCat = data.expenseCategories.find((c: any) =>
                          c.subcategories.some((s: any) => s.name.toLowerCase() === val)
                        );
                        if (matchedCat) {
                          setSelectedFormCategoryId(matchedCat.id);
                        }
                      }
                    }}
                  />
                  <datalist id="suggestions">
                    {txType === "income"
                      ? data.incomeSources.map((s: any) => <option key={s.id} value={s.name} />)
                      : (selectedFormCategoryId
                        ? data.expenseCategories.find((c: any) => c.id === selectedFormCategoryId)?.subcategories.map((s: any) => <option key={s.id} value={s.name} />)
                        : data.expenseCategories.flatMap((c: any) => c.subcategories).map((s: any) => <option key={s.id} value={s.name} />)
                      )
                    }
                  </datalist>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor (R$)</label>
                    <input required name="amount" defaultValue={isCommission ? computedAmount : ""} key={isCommission ? "comm-" + computedAmount : "manual"} placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all font-bold" />
                  </div>
                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">
                      Vencimento {txType !== "expense" && <span className="text-slate-600 normal-case font-normal">(opcional)</span>}
                    </label>
                    <input
                      required={txType === "expense"}
                      name="dueDate"
                      type="date"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Conta de Origem / Destino</label>
                  <select 
                    required 
                    name="accountId" 
                    value={selectedFormAccountId}
                    onChange={(e) => setSelectedFormAccountId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm"
                  >
                    {data.accounts?.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name} (R$ {a.balance.toLocaleString('pt-BR')})</option>
                    ))}
                  </select>
                </div>

                {txType === "expense" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Categoria</label>
                      <select
                        required
                        name="categoryId"
                        value={selectedFormCategoryId}
                        onChange={(e) => setSelectedFormCategoryId(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm"
                      >
                        <option value="">Selecione...</option>
                        {data.expenseCategories.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Natureza</label>
                      <select required name="nature" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm">
                        <option value="essential">Essencial</option>
                        <option value="important">Importante</option>
                        <option value="superfluous">Supérfluo</option>
                      </select>
                    </div>
                  </div>
                ) : txType === 'debt' ? (
                  <div className="space-y-4">
                    {/* Campo oculto: seleciona automaticamente a fonte 'Recebimento de Dívida' */}
                    <input type="hidden" name="incomeSourceId" value={debtRecoverySourceId} />
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Nome do Devedor (Quem me pagou?)</label>
                      <input
                        name="notes"
                        placeholder="Ex: João Silva, Carlos..."
                        className="w-full bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl">
                      <span className="material-symbols-outlined text-primary text-sm">info</span>
                      <p className="text-[10px] text-primary font-bold">Este recebimento aparecerá em Receitas do mês selecionado.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Fonte da Receita</label>
                      <select required name="incomeSourceId" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm">
                        <option value="">Selecione...</option>
                        {data.incomeSources.filter((s: any) => s.name !== 'Recebimento de Dívida').map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {txType === "expense" && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" name="isInstallment" value="true" id="isInstallment" checked={isInstallment} onChange={(e) => { setIsInstallment(e.target.checked); if (e.target.checked) setIsRecurring(false); }} className="w-5 h-5 rounded border-white/10 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0" />
                        <label htmlFor="isInstallment" className="text-sm font-bold text-slate-300">Parcelado</label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" name="isRecurring" value="true" id="isRecurring" checked={isRecurring} onChange={(e) => { setIsRecurring(e.target.checked); if (e.target.checked) setIsInstallment(false); }} className="w-5 h-5 rounded border-white/10 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0" />
                        <label htmlFor="isRecurring" className="text-sm font-bold text-slate-300">Fixo Mensal</label>
                      </div>
                    </div>
                    {isInstallment && (
                      <div className="flex items-center gap-3 animate-in slide-in-from-top-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">Núm. Parcelas:</label><input name="installmentsCount" type="number" min="2" max="100" value={installmentsCount} onChange={(e) => setInstallmentsCount(e.target.value)} className="w-20 bg-white/10 border-none rounded-lg p-2 text-xs text-white" /></div>
                    )}
                  </div>
                )}
                {txType === "income" && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3"><input type="checkbox" id="isComm" checked={isCommission} onChange={(e) => setIsCommission(e.target.checked)} className="w-5 h-5 rounded border-white/10 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0" /><label htmlFor="isComm" className="text-sm font-bold text-slate-300">Comissão</label></div>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" name="isRecurring" value="true" id="isRecurringInc" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="w-5 h-5 rounded border-white/10 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0" />
                        <label htmlFor="isRecurringInc" className="text-sm font-bold text-slate-300">Fixo Mensal</label>
                      </div>
                    </div>
                    {isCommission && (
                      <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor Venda (Contrato)</label>
                          <input placeholder="Valor Venda" value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="w-full bg-white/10 border-none rounded-lg p-2 text-xs text-white" />
                        </div>
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">% Comissão</label>
                          <select value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className="w-full bg-white/10 border-none rounded-lg p-2 text-xs text-white"><option value="10">10%</option><option value="20">20%</option><option value="30">30%</option></select>
                        </div>
                        <div className="col-span-2 mt-2">
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Abatimento / Antecipação (R$)</label>
                          <input name="abatement" placeholder="Ex: 330,00" className="w-full bg-primary/20 border border-primary/30 rounded-lg p-2 text-xs text-white placeholder-primary/50" />
                          <p className="text-[8px] text-slate-500 mt-1">* Valor já recebido antecipadamente que abate do total.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Campo de notas só aparece manualmente quando não é dívida (para dívida, usamos o campo acima) */}
                {txType !== 'debt' && (
                  <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Notas / Cliente</label><textarea name="notes" rows={2} placeholder="Identifique o cliente..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm" /></div>
                )}

                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Anexar Comprovante / PDF</label>
                  <div className="relative h-14 bg-white/5 border border-white/10 rounded-xl border-dashed hover:border-primary/50 transition-all flex items-center px-4 overflow-hidden">
                    <input type="file" name="attachment" className="absolute inset-0 opacity-0 cursor-pointer" />
                    <span className="material-symbols-outlined text-slate-500 mr-2">upload_file</span>
                    <span className="text-xs text-slate-400 font-bold truncate">Arraste ou selecione o arquivo...</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                  <input type="checkbox" name="isPaid" value="true" id="isPaid" className="w-5 h-5 rounded border-white/10 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0" />
                  <label htmlFor="isPaid" className="text-sm font-bold text-slate-300">Marcar como {txType === 'expense' ? 'Pago' : 'Recebido'} agora {isInstallment ? '(Apenas 1ª parcela)' : ''}</label>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-xl text-sm font-bold text-slate-500 hover:text-white transition-colors">Cancelar</button>
                <button disabled={isSubmitting} type="submit" className="flex-[2] h-12 bg-primary text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50">{isSubmitting ? "Gravando..." : "Confirmar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSET MODAL */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsAssetModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-8 text-center text-success">Novo Ativo</h3>
            <form onSubmit={handleSubmitAsset} className="space-y-6">
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Nome do Ativo (Carro, Imóvel, BTC...)</label>
                <input required name="name" placeholder="Ex: Porsche 911" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-success transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Tipo</label>
                  <select name="type" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-success transition-all text-sm">
                    <option value="Imóvel">Imóvel</option>
                    <option value="Veículo">Veículo</option>
                    <option value="Investimento">Investimento</option>
                    <option value="Cripto">Cripto</option>
                  </select>
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor Avaliado (R$)</label>
                  <input required name="amount" placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-success transition-all font-bold" />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4">
                <button type="button" onClick={() => setIsAssetModalOpen(false)} className="flex-1 h-12 rounded-xl text-sm font-bold text-slate-500 hover:text-white transition-colors">Cancelar</button>
                <button disabled={isSubmitting} type="submit" className="flex-[2] h-12 bg-success text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-success/20 hover:scale-[1.02] transition-all disabled:opacity-50">{isSubmitting ? "Gravando..." : "Confirmar Ativo"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIABILITY MODAL */}
      {isLiabilityModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsLiabilityModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-8 text-center text-danger">Novo Passivo</h3>
            <form onSubmit={handleSubmitLiability} className="space-y-6">
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Nome do Passivo (Empréstimo, Financiamento...)</label>
                <input required name="name" placeholder="Ex: Financiamento Casa" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-danger transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Tipo</label>
                  <select name="type" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-danger transition-all text-sm">
                    <option value="Financiamento">Financiamento</option>
                    <option value="Empréstimo">Empréstimo</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor Restante (R$)</label>
                  <input required name="outstandingAmount" placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-danger transition-all font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor Total Original (R$)</label>
                  <input required name="totalAmount" placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-danger transition-all font-bold" />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Parcela Mensal (R$)</label>
                  <input required name="monthlyPayment" placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-danger transition-all font-bold" />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4">
                <button type="button" onClick={() => setIsLiabilityModalOpen(false)} className="flex-1 h-12 rounded-xl text-sm font-bold text-slate-500 hover:text-white transition-colors">Cancelar</button>
                <button disabled={isSubmitting} type="submit" className="flex-[2] h-12 bg-danger text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-danger/20 hover:scale-[1.02] transition-all disabled:opacity-50">{isSubmitting ? "Gravando..." : "Confirmar Passivo"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GOAL MODAL */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsGoalModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-8 text-center text-primary">Novo Objetivo</h3>
            <form onSubmit={handleSubmitGoal} className="space-y-6">
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Título da Meta</label>
                <input required name="title" placeholder="Ex: Reserva de Emergência" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor Alvo (R$)</label>
                  <input required name="targetAmount" placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all font-bold" />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Data Limite</label>
                  <input required name="targetDate" type="date" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
                </div>
              </div>
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Por que isso é importante?</label>
                <textarea name="description" rows={3} placeholder="Sua motivação aqui..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm" />
              </div>
              <div className="flex items-center gap-4 pt-4">
                <button type="button" onClick={() => setIsGoalModalOpen(false)} className="flex-1 h-12 rounded-xl text-sm font-bold text-slate-500 hover:text-white transition-colors">Cancelar</button>
                <button disabled={isSubmitting} type="submit" className="flex-[2] h-12 bg-primary text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50">{isSubmitting ? "Gravando..." : "Fixar Objetivo"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BUDGET MODAL */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsBudgetModalOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-8 text-center text-warning">Ajustar Teto</h3>
            <p className="text-xs text-slate-400 mb-6 text-center">Defina o limite máximo de gastos mensais para a categoria de <strong>{data.expenseCategories.find((c: any) => c.id === selectedCategoryId)?.name}</strong>.</p>
            <form onSubmit={handleUpdateBudget} className="space-y-6">
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Limite Mensal (R$)</label>
                <input required name="budgetLimit" defaultValue={((data.expenseCategories.find((c: any) => c.id === selectedCategoryId)?.budgetLimit) ?? 0) / 100 || ""} placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-warning transition-all font-bold text-center text-xl" />
              </div>
              <div className="flex flex-col gap-2 pt-4">
                <button disabled={isSubmitting} type="submit" className="h-12 bg-warning text-slate-950 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-warning/20 hover:scale-[1.02] transition-all disabled:opacity-50">Salvar Limite</button>
                <button type="button" onClick={() => setIsBudgetModalOpen(false)} className="h-12 rounded-xl text-xs font-bold text-slate-500 hover:text-white transition-colors">Fechar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRILL-DOWN MODAL */}
      {drillDown && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => { setDrillDown(null); setEditingItem(null); }}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter">{drillDown.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{drillDown.items.length} lançamento(s)</p>
              </div>
              <button onClick={() => { setDrillDown(null); setEditingItem(null); }} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>

            {/* Inline edit form */}
            {editingItem && (
              <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-2xl shrink-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Editando: {editingItem.name}</p>
                <form onSubmit={handleEditSave} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Nome</label>
                    <input name="title" defaultValue={editingItem.name} required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Natureza</label>
                      <select name="nature" defaultValue={editingItem.nature || "essential"}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-primary">
                        <option value="essential">Essencial</option>
                        <option value="important">Importante</option>
                        <option value="superfluous">Supérfluo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Categoria</label>
                      <select name="categoryId" defaultValue={editingItem.categoryId || ""}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-primary">
                        <option value="">— Sem categoria —</option>
                        {data.expenseCategories.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Observações</label>
                    <input name="notes" defaultValue={editingItem.notes || ""}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-primary" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={isEditSaving}
                      className="flex-1 h-9 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50">
                      {isEditSaving ? "Salvando..." : "Salvar"}
                    </button>
                    <button type="button" onClick={() => setEditingItem(null)}
                      className="h-9 px-4 bg-white/5 border border-white/10 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10">
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {drillDown.items.length === 0 ? (
              <div className="text-center py-12 text-slate-500 italic text-sm">Nenhum lançamento encontrado.</div>
            ) : (
              (() => {
                const isBalanceView = drillDown.title === "Movimentações que formam o saldo";
                const sorted = isBalanceView
                  ? [...drillDown.items].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  : [...drillDown.items].sort((a: any, b: any) => Math.abs(b.amount) - Math.abs(a.amount));
                const netBalance = isBalanceView
                  ? drillDown.items.reduce((acc: number, t: any) => t.type === "income" ? acc + Math.abs(t.amount) : acc - Math.abs(t.amount), 0)
                  : null;
                return (
                  <div className="overflow-y-auto space-y-2 pr-1">
                    {sorted.map((item: any) => {
                      const isIncome = item.type === "income";
                      return (
                        <div key={item.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${editingItem?.id === item.id ? 'bg-primary/5 border-primary/20' : 'bg-white/5 border-white/5'}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isIncome ? 'bg-success/10' : 'bg-danger/10'}`}>
                              <span className={`material-symbols-outlined text-sm ${isIncome ? 'text-success' : 'text-danger'}`}>
                                {isIncome ? 'arrow_downward' : 'arrow_upward'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white leading-tight truncate">{item.name}</p>
                              <p className="text-[10px] text-slate-500">
                                {item.displayDate}
                                {item.nature && <span className="text-slate-600"> · {item.nature === 'essential' ? 'Essencial' : item.nature === 'important' ? 'Importante' : 'Supérfluo'}</span>}
                              </p>
                              {item.notes && <p className="text-[10px] text-slate-600 italic mt-0.5 truncate">{item.notes}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className={`text-sm font-black ${isIncome ? 'text-success' : 'text-danger'}`}>
                              {isIncome ? '+' : '-'} R$ {Math.abs(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            {item.type === "expense" && (
                              <button onClick={() => setEditingItem(editingItem?.id === item.id ? null : item)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${editingItem?.id === item.id ? 'bg-primary text-white' : 'bg-white/5 text-slate-500 hover:text-white hover:bg-white/10'}`}>
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-3 border-t border-white/5 shrink-0 space-y-1">
                      {isBalanceView ? (
                        <>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <span>Entradas</span>
                            <span className="text-success">+ R$ {drillDown.items.filter((t:any)=>t.type==="income").reduce((a:number,t:any)=>a+Math.abs(t.amount),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <span>Saídas</span>
                            <span className="text-danger">- R$ {drillDown.items.filter((t:any)=>t.type==="expense").reduce((a:number,t:any)=>a+Math.abs(t.amount),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                          </div>
                          <div className="flex justify-between text-xs font-black uppercase tracking-widest pt-1 border-t border-white/5">
                            <span className="text-slate-400">Saldo</span>
                            <span className={netBalance! >= 0 ? 'text-success' : 'text-danger'}>R$ {netBalance!.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                          <span className="text-slate-500">Total</span>
                          <span className="text-white">R$ {drillDown.items.reduce((acc:number,t:any)=>acc+Math.abs(t.amount),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* EDIT TRANSACTION MODAL */}
      {editingTx && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setEditingTx(null)}></div>
          <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Editar Lançamento</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingTx.type === "income" ? "Receita" : "Despesa"}</p>
              </div>
              <button onClick={() => setEditingTx(null)} className="text-slate-500 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Nome</label>
                <input name="title" required defaultValue={editingTx.name}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
              </div>
              {/* Valor + Data */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Valor (R$)</label>
                  <input name="amount"
                    defaultValue={Math.abs(editingTx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">
                    Vencimento {editingTx.type === "income" && <span className="text-slate-600 normal-case font-normal">(opcional)</span>}
                  </label>
                  <input name="date" type="date"
                    required={editingTx.type === "expense"}
                    defaultValue={editingTx.date ? editingTx.date.split("T")[0] : ""}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
                </div>
              </div>
              {/* Despesa: natureza + categoria */}
              {editingTx.type === "expense" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Natureza</label>
                    <select name="nature" defaultValue={editingTx.nature || "essential"}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm">
                      <option value="essential">Essencial</option>
                      <option value="important">Importante</option>
                      <option value="superfluous">Supérfluo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Categoria</label>
                    <select name="categoryId" defaultValue={editingTx.categoryId || ""}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-sm">
                      <option value="">— Sem categoria —</option>
                      {data.expenseCategories.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {/* Observações */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Observações</label>
                <input name="notes" defaultValue={editingTx.notes || ""}
                  placeholder="Opcional..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSavingTx}
                  className="flex-1 h-12 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/80 transition-all disabled:opacity-50 shadow-lg shadow-primary/20">
                  {isSavingTx ? "Salvando..." : "Salvar alterações"}
                </button>
                <button type="button" onClick={() => setEditingTx(null)}
                  className="h-12 px-6 bg-white/5 border border-white/10 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CARD MODAL */}
      {isCardModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsCardModalOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Novo Cartão</h3>
              <button onClick={() => setIsCardModalOpen(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleCreateCard} className="space-y-4">
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Nome do Cartão</label>
                <input required name="name" placeholder="Ex: Nubank, Inter Gold..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
              </div>
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Bandeira</label>
                <select required name="brand" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all">
                  <option value="">Selecione...</option>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="Elo">Elo</option>
                  <option value="Amex">American Express</option>
                  <option value="Hipercard">Hipercard</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Limite (R$)</label>
                <input required name="limitAmount" placeholder="0,00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all font-bold text-center text-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Fechamento (dia)</label>
                  <input required name="closingDay" type="number" min="1" max="31" defaultValue="20" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-center font-bold" />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Vencimento (dia)</label>
                  <input required name="dueDay" type="number" min="1" max="31" defaultValue="5" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-center font-bold" />
                </div>
              </div>
              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 ml-1">Conta vinculada (opcional)</label>
                <select name="accountId" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all">
                  <option value="">Nenhuma</option>
                  {data.accounts.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button disabled={isSubmitting} type="submit" className="h-12 bg-primary text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50">{isSubmitting ? "Salvando..." : "Adicionar Cartão"}</button>
                <button type="button" onClick={() => setIsCardModalOpen(false)} className="h-12 rounded-xl text-xs font-bold text-slate-500 hover:text-white transition-colors">Fechar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ t, payingId, deletingId, handleMarkPaid, handleDelete, onEdit }: any) {
  return (
    <div
      className="transaction-row flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/[0.08] transition-all group relative overflow-hidden"
      data-category={t.categoryId}
      data-source={t.incomeSourceId}
      data-nature={t.nature}
    >
      <div className="flex items-center gap-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
          t.isDebtRecovery ? 'bg-primary/10 text-primary shadow-[0_0_20px_rgba(19,91,236,0.1)]' :
          t.type === "income" ? "bg-success/10 text-success shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "bg-danger/10 text-danger shadow-[0_0_20px_rgba(244,63,94,0.1)]"
        }`}>
          <span className="material-symbols-outlined text-2xl">{t.isDebtRecovery ? 'handshake' : t.type === "income" ? "arrow_downward" : "arrow_upward"}</span>
        </div>
        <div>
          <h4 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            {t.name}
            {t.isRecurring && <span className="material-symbols-outlined text-primary text-sm">sync</span>}
            {t.attachmentUrl && (
              <a href={t.attachmentUrl} target="_blank" className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-sm">
                <span className="material-symbols-outlined text-sm">description</span>
              </a>
            )}
          </h4>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-widest
              ${t.status === 'paid' || t.status === 'received' ? 'bg-white/10 text-slate-500'
              : t.status === 'partial' ? 'bg-primary/20 text-primary'
              : 'bg-warning/20 text-warning'}`}>
              {t.status === 'paid' || t.status === 'received' ? 'Liquidado'
               : t.status === 'partial' ? 'Parcial'
               : 'Pendente'}
            </span>
            {t.displayDate && <span className="text-xs font-bold text-slate-500">Vence {t.displayDate}</span>}
            {t.status === 'partial' && t.type === 'income' && (
              <span className="text-[10px] text-primary font-bold">Saldo pendente</span>
            )}
          </div>
          {t.notes && <p className="text-xs text-slate-400 mt-2 italic flex items-center gap-1.5"><span className="material-symbols-outlined text-xs">info</span> {t.notes}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-6 mt-4 sm:mt-0 pl-20 sm:pl-0 w-full sm:w-auto">
        <div className={`text-2xl font-black tracking-tighter ${t.type === 'income' ? 'text-success' : 'text-white'}`}>{t.type === 'income' ? '+' : '-'} R$ {Math.abs(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div className="flex items-center gap-2 lg:opacity-0 group-hover:opacity-100 transition-all">
          {(t.status === "pending" || t.status === "expected" || t.status === "partial") && (
            <button disabled={payingId === t.id} onClick={() => handleMarkPaid(t.id, t.type)}
              className="bg-white text-slate-900 h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-xl active:scale-95">
              {t.status === "partial" ? "Quitar" : "Baixar"}
            </button>
          )}
          <button onClick={() => onEdit?.(t)}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center active:scale-90">
            <span className="material-symbols-outlined text-xl">edit</span>
          </button>
          <button disabled={deletingId === t.id} onClick={() => handleDelete(t.id, t.type)}
            className="w-10 h-10 rounded-xl bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center active:scale-90 shadow-xl">
            <span className="material-symbols-outlined text-xl">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, badge, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300 group ${active ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" : "text-slate-500 hover:text-white hover:bg-white/5"}`}>
      <span className={`material-symbols-outlined transition-colors ${active ? "text-white" : "group-hover:text-primary"}`}>{icon}</span>
      <span className="hidden lg:block uppercase tracking-widest text-[11px] font-black">{label}</span>
      {badge && badge !== "0" && !active && <span className="ml-auto bg-primary text-white text-[10px] h-5 w-5 rounded-full flex items-center justify-center font-black animate-pulse">{badge}</span>}
    </button>
  );
}

function MobileNavItem({ icon, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`p-3 rounded-xl transition-all ${active ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110' : 'text-slate-500'}`}><span className="material-symbols-outlined text-2xl">{icon}</span></button>
  );
}

function KpiCard({ title, value, trend, trendUp, icon, color, onClick, titleTooltip }: any) {
  const colors: any = { primary: "from-primary/20 to-primary/5 text-primary border-primary/20 shadow-primary/5", success: "from-success/20 to-success/5 text-success border-success/20 shadow-success/5", danger: "from-danger/20 to-danger/5 text-danger border-danger/20 shadow-danger/5", warning: "from-warning/20 to-warning/5 text-warning border-warning/20 shadow-warning/5" };
  return (
    <div 
      onClick={onClick}
      className={`relative overflow-hidden bg-gradient-to-br ${colors[color]} backdrop-blur-xl border rounded-[2rem] p-6 shadow-2xl transition-all ${onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98] hover:border-white/20' : ''} group`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{title}</h3>
          {titleTooltip && <span className="text-[8px] text-white/30 font-bold mt-0.5 tracking-tight uppercase leading-none">{titleTooltip}</span>}
        </div>
        <div className={`p-2.5 rounded-xl bg-white/10 backdrop-blur-md`}><span className="material-symbols-outlined text-xl">{icon}</span></div>
      </div>
      <div><div className="text-2xl font-black text-white tracking-tighter mb-2 truncate">{value}</div><div className="flex items-center justify-between"><div className={`text-[10px] font-black px-2 py-0.5 rounded bg-white/5 ${trendUp ? 'text-success' : 'text-danger'}`}>{trend}</div></div></div>
    </div>
  );
}
