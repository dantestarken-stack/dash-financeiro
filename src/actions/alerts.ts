"use server";

/**
 * Sistema de Alertas Financeiros.
 * Analisa os dados do usuário e gera alertas relevantes:
 * - Contas vencendo em breve ou atrasadas
 * - Orçamento de categoria excedido
 * - Saldo projetado negativo
 * - Comissões pendentes há muito tempo
 */

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { addDays } from "date-fns";

// ─── Geração de alertas ───────────────────────────────────────────────────────

export async function generateAlerts() {
  const userId = await requireUserId();

  const now = new Date();
  const in7Days = addDays(now, 7);

  const [pendingExpenses, expenseCategories, expenses, accounts, incomes] = await Promise.all([
    // Despesas pendentes ou atrasadas
    prisma.expense.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { in: ["pending", "overdue"] },
        dueDate: { lte: in7Days },
      },
    }),
    // Categorias com limite de orçamento
    prisma.expenseCategory.findMany({
      where: { userId, budgetLimit: { gt: 0 } },
    }),
    // Despesas do mês atual
    prisma.expense.findMany({
      where: {
        userId,
        deletedAt: null,
        competencyDate: {
          gte: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)),
          lte: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)),
        },
      },
    }),
    // Saldos das contas
    prisma.account.findMany({ where: { userId } }),
    // Receitas pendentes do mês
    prisma.income.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { in: ["expected", "partial"] },
        competencyDate: {
          gte: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)),
          lte: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)),
        },
      },
    }),
  ]);

  const alertsToCreate: Array<{
    userId: string;
    type: string;
    title: string;
    description: string;
    severity: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    triggeredAt: Date;
  }> = [];

  // Alerta 1: Conta vencendo hoje ou amanhã
  const tomorrow = addDays(now, 1);
  pendingExpenses.forEach((exp) => {
    const due = new Date(exp.dueDate);
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      alertsToCreate.push({
        userId,
        type: "overdue_expense",
        title: `Conta atrasada: ${exp.title}`,
        description: `Esta despesa venceu há ${Math.abs(daysUntilDue)} dia(s) e ainda não foi paga. Valor: R$ ${(exp.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
        severity: "critical",
        relatedEntityType: "expense",
        relatedEntityId: exp.id,
        triggeredAt: now,
      });
    } else if (daysUntilDue <= 2) {
      alertsToCreate.push({
        userId,
        type: "due_soon_expense",
        title: `Vence ${daysUntilDue === 0 ? "hoje" : "amanhã"}: ${exp.title}`,
        description: `R$ ${(exp.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — não esqueça de pagar!`,
        severity: "warning",
        relatedEntityType: "expense",
        relatedEntityId: exp.id,
        triggeredAt: now,
      });
    }
  });

  // Alerta 2: Orçamento de categoria excedido ou perto do limite
  expenseCategories.forEach((cat) => {
    const spent = expenses
      .filter((e) => e.categoryId === cat.id)
      .reduce((acc, e) => acc + e.amount, 0);

    const pct = (spent / cat.budgetLimit) * 100;

    if (pct >= 100) {
      alertsToCreate.push({
        userId,
        type: "budget_exceeded",
        title: `Orçamento de "${cat.name}" excedido!`,
        description: `Você gastou R$ ${(spent / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de um limite de R$ ${(cat.budgetLimit / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pct.toFixed(0)}%).`,
        severity: "critical",
        relatedEntityType: "category",
        relatedEntityId: cat.id,
        triggeredAt: now,
      });
    } else if (pct >= 80) {
      alertsToCreate.push({
        userId,
        type: "budget_warning",
        title: `Orçamento de "${cat.name}" quase no limite`,
        description: `Você já usou ${pct.toFixed(0)}% do orçamento desta categoria (R$ ${(spent / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de R$ ${(cat.budgetLimit / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`,
        severity: "warning",
        relatedEntityType: "category",
        relatedEntityId: cat.id,
        triggeredAt: now,
      });
    }
  });

  // Alerta 3: Saldo projetado negativo
  const totalBalance = accounts.reduce((acc, a) => acc + a.currentBalance, 0);
  const pendingPayments = pendingExpenses.reduce((acc, e) => acc + (e.amount - e.paidAmount), 0);
  const pendingReceipts = incomes.reduce((acc, i) => acc + (i.expectedAmount - i.receivedAmount), 0);
  const projectedBalance = totalBalance + pendingReceipts - pendingPayments;

  if (projectedBalance < 0) {
    alertsToCreate.push({
      userId,
      type: "negative_projected_balance",
      title: "Saldo projetado negativo este mês!",
      description: `Com os lançamentos pendentes, seu saldo projetado ao fim do mês será de R$ ${(projectedBalance / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Revise suas despesas ou antecipe receitas.`,
      severity: "critical",
      triggeredAt: now,
    });
  }

  // Remove alertas antigos do mesmo tipo antes de inserir os novos
  if (alertsToCreate.length > 0) {
    const types = [...new Set(alertsToCreate.map((a) => a.type))];
    await prisma.alert.deleteMany({ where: { userId, type: { in: types } } });
    await prisma.alert.createMany({ data: alertsToCreate });
  }

  revalidatePath("/");
  return { generated: alertsToCreate.length };
}

// ─── Leitura de alertas ───────────────────────────────────────────────────────

export async function getAlerts() {
  const userId = await requireUserId();

  const alerts = await prisma.alert.findMany({
    where: { userId },
    orderBy: [{ severity: "desc" }, { triggeredAt: "desc" }],
    take: 20,
  });

  return alerts;
}

export async function markAlertAsRead(alertId: string) {
  const userId = await requireUserId();
  await prisma.alert.update({
    where: { id: alertId, userId },
    data: { isRead: true },
  });
  revalidatePath("/");
}

export async function clearAllAlerts() {
  const userId = await requireUserId();
  await prisma.alert.updateMany({
    where: { userId },
    data: { isRead: true },
  });
  revalidatePath("/");
}
