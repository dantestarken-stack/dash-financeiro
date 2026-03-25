"use server";

/**
 * Monthly Snapshot: captura o estado financeiro do mês e salva em MonthlySnapshot.
 * Deve ser chamada no encerramento de cada mês (via CRON job ou manualmente).
 * Garante histórico imutável para relatórios analíticos.
 */

import prisma from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function generateMonthlySnapshot(year: number, month: number) {
  const userId = await requireUserId();

  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const referenceMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

  const [incomes, expenses] = await Promise.all([
    prisma.income.findMany({
      where: { userId, deletedAt: null, competencyDate: { gte: firstDay, lte: lastDay } },
    }),
    prisma.expense.findMany({
      where: { userId, deletedAt: null, competencyDate: { gte: firstDay, lte: lastDay } },
    }),
  ]);

  const totalIncomeExpected = incomes.reduce((acc, i) => acc + i.expectedAmount, 0);
  const totalIncomeReceived = incomes.reduce((acc, i) => acc + i.receivedAmount, 0);
  const totalExpensesExpected = expenses.reduce((acc, e) => acc + e.amount, 0);
  const totalExpensesPaid = expenses.reduce((acc, e) => acc + e.paidAmount, 0);

  const netResult = totalIncomeReceived - totalExpensesPaid;
  const projectedResult = totalIncomeExpected - totalExpensesExpected;

  const essentialExpensesTotal = expenses
    .filter((e) => e.nature === "essential")
    .reduce((acc, e) => acc + e.amount, 0);
  const superfluousExpensesTotal = expenses
    .filter((e) => e.nature === "superfluous")
    .reduce((acc, e) => acc + e.amount, 0);

  const savingsRate =
    totalIncomeReceived > 0
      ? Math.max(0, (netResult / totalIncomeReceived) * 100)
      : 0;

  await prisma.monthlySnapshot.upsert({
    where: { userId_referenceMonth: { userId, referenceMonth } },
    create: {
      userId,
      referenceMonth,
      totalIncomeExpected,
      totalIncomeReceived,
      totalExpensesExpected,
      totalExpensesPaid,
      netResult,
      projectedResult,
      essentialExpensesTotal,
      superfluousExpensesTotal,
      savingsRate,
    },
    update: {
      totalIncomeExpected,
      totalIncomeReceived,
      totalExpensesExpected,
      totalExpensesPaid,
      netResult,
      projectedResult,
      essentialExpensesTotal,
      superfluousExpensesTotal,
      savingsRate,
    },
  });

  return { success: true, referenceMonth };
}

/** Retorna todos os snapshots do usuário ordenados do mais recente para o mais antigo. */
export async function getMonthlySnapshots() {
  const userId = await requireUserId();

  const snapshots = await prisma.monthlySnapshot.findMany({
    where: { userId },
    orderBy: { referenceMonth: "desc" },
  });

  return snapshots.map((s) => ({
    referenceMonth: s.referenceMonth,
    totalIncomeReceived: s.totalIncomeReceived / 100,
    totalExpensesPaid: s.totalExpensesPaid / 100,
    netResult: s.netResult / 100,
    essentialExpensesTotal: s.essentialExpensesTotal / 100,
    superfluousExpensesTotal: s.superfluousExpensesTotal / 100,
    savingsRate: parseFloat(s.savingsRate.toFixed(1)),
  }));
}
