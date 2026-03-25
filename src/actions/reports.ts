"use server";

/**
 * Módulo de Relatórios Analíticos.
 * Gera relatórios consolidados para exibição no módulo de Relatórios e Insights.
 */

import prisma from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export interface MonthlySummary {
  month: string;           // "2026-01"
  label: string;           // "Janeiro 2026"
  income: number;          // em reais
  expenses: number;        // em reais
  net: number;             // em reais
  savingsRate: number;     // percentual 0-100
}

export interface CategoryBreakdown {
  name: string;
  total: number;
  percentage: number;
}

export interface ReportData {
  monthlySummary: MonthlySummary[];
  categoryBreakdown: CategoryBreakdown[];
  topExpenses: { title: string; amount: number; date: string }[];
  incomeBySource: { source: string; total: number; percentage: number }[];
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
  bestMonth: MonthlySummary | null;
  worstMonth: MonthlySummary | null;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export async function getReportData(monthsBack = 12): Promise<ReportData> {
  const userId = await requireUserId();

  const now = new Date();
  const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - monthsBack + 1, 1));

  const [incomes, expenses, incomeSources] = await Promise.all([
    prisma.income.findMany({
      where: {
        userId,
        deletedAt: null,
        competencyDate: { gte: startDate },
      },
      include: { incomeSource: true },
    }),
    prisma.expense.findMany({
      where: {
        userId,
        deletedAt: null,
        competencyDate: { gte: startDate },
      },
      include: { category: true },
    }),
    prisma.incomeSource.findMany({ where: { userId } }),
  ]);

  // ── Resumo mensal ─────────────────────────────────────────────────────────

  const monthMap: Record<string, { income: number; expenses: number }> = {};

  incomes.forEach((i) => {
    const key = `${i.competencyDate.getUTCFullYear()}-${String(i.competencyDate.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { income: 0, expenses: 0 };
    monthMap[key].income += i.receivedAmount;
  });

  expenses.forEach((e) => {
    const key = `${e.competencyDate.getUTCFullYear()}-${String(e.competencyDate.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { income: 0, expenses: 0 };
    monthMap[key].expenses += e.paidAmount;
  });

  const monthlySummary: MonthlySummary[] = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const [year, monthStr] = key.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1;
      const net = data.income - data.expenses;
      const savingsRate = data.income > 0 ? Math.max(0, (net / data.income) * 100) : 0;
      return {
        month: key,
        label: `${MONTH_NAMES[monthIdx]} ${year}`,
        income: data.income / 100,
        expenses: data.expenses / 100,
        net: net / 100,
        savingsRate: parseFloat(savingsRate.toFixed(1)),
      };
    });

  // ── Breakdown por categoria ───────────────────────────────────────────────

  const catMap: Record<string, { name: string; total: number }> = {};
  expenses.forEach((e) => {
    const name = e.category?.name ?? "Sem categoria";
    if (!catMap[name]) catMap[name] = { name, total: 0 };
    catMap[name].total += e.amount;
  });

  const totalExpensesAll = Object.values(catMap).reduce((acc, c) => acc + c.total, 0);
  const categoryBreakdown: CategoryBreakdown[] = Object.values(catMap)
    .sort((a, b) => b.total - a.total)
    .map((c) => ({
      name: c.name,
      total: c.total / 100,
      percentage: totalExpensesAll > 0 ? parseFloat(((c.total / totalExpensesAll) * 100).toFixed(1)) : 0,
    }));

  // ── Top 10 maiores despesas ───────────────────────────────────────────────

  const topExpenses = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((e) => ({
      title: e.title,
      amount: e.amount / 100,
      date: new Date(e.dueDate.getTime() + e.dueDate.getTimezoneOffset() * 60000).toLocaleDateString("pt-BR"),
    }));

  // ── Receita por fonte ─────────────────────────────────────────────────────

  const sourceMap: Record<string, { name: string; total: number }> = {};
  incomes.forEach((i) => {
    const name = i.incomeSource?.name ?? "Outra fonte";
    if (!sourceMap[name]) sourceMap[name] = { name, total: 0 };
    sourceMap[name].total += i.receivedAmount;
  });

  const totalIncomeAll = Object.values(sourceMap).reduce((acc, s) => acc + s.total, 0);
  const incomeBySource = Object.values(sourceMap)
    .sort((a, b) => b.total - a.total)
    .map((s) => ({
      source: s.name,
      total: s.total / 100,
      percentage: totalIncomeAll > 0 ? parseFloat(((s.total / totalIncomeAll) * 100).toFixed(1)) : 0,
    }));

  // ── Médias e extremos ─────────────────────────────────────────────────────

  const avgIncome = monthlySummary.length > 0
    ? monthlySummary.reduce((acc, m) => acc + m.income, 0) / monthlySummary.length
    : 0;
  const avgExpense = monthlySummary.length > 0
    ? monthlySummary.reduce((acc, m) => acc + m.expenses, 0) / monthlySummary.length
    : 0;

  const bestMonth = monthlySummary.length > 0
    ? monthlySummary.reduce((best, m) => m.net > best.net ? m : best)
    : null;
  const worstMonth = monthlySummary.length > 0
    ? monthlySummary.reduce((worst, m) => m.net < worst.net ? m : worst)
    : null;

  return {
    monthlySummary,
    categoryBreakdown,
    topExpenses,
    incomeBySource,
    averageMonthlyIncome: parseFloat(avgIncome.toFixed(2)),
    averageMonthlyExpense: parseFloat(avgExpense.toFixed(2)),
    bestMonth,
    worstMonth,
  };
}
