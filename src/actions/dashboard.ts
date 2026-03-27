"use server";

import prisma from "@/lib/prisma";
import { startOfMonth, isBefore, isSameMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TransactionStatus } from "@/lib/types";

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface MappedTransaction {
  id: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  displayDate: string;
  status: TransactionStatus;
  nature?: string;
  categoryId?: string;
  incomeSourceId?: string;
  isDebtRecovery?: boolean;
  isRecurring?: boolean;
  notes?: string | null;
  attachmentUrl?: string;
  createdAt?: Date;
}

// ─── getDashboardData ────────────────────────────────────────────────────────

export async function getDashboardData(year: number, month: number, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado.");

  // Limites UTC do mês solicitado
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  // Busca paralela de todas as fontes de renda para identificar comissões por tipo
  const [incomeSources, accounts] = await Promise.all([
    prisma.incomeSource.findMany({ where: { userId } }),
    prisma.account.findMany({ where: { userId } }),
  ]);

  // IDs das fontes do tipo "commission"
  const commissionSourceIds = new Set(
    incomeSources.filter((s) => s.type === "commission").map((s) => s.id)
  );

  // IDs das fontes do tipo "salary"
  const salarySourceIds = new Set(
    incomeSources.filter((s) => s.type === "salary" || s.name.toLowerCase().includes("salário") || s.name.toLowerCase().includes("salario")).map((s) => s.id)
  );

  // Garante que a fonte "Recebimento de Dívida" existe
  let debtRecoverySource = incomeSources.find((s) => s.name === "Recebimento de Dívida");
  if (!debtRecoverySource) {
    debtRecoverySource = await prisma.incomeSource.create({
      data: {
        userId,
        name: "Recebimento de Dívida",
        type: "debt_recovery",
        isActive: true,
      },
    });
    incomeSources.push(debtRecoverySource);
  }
  const resolvedDebtSource = debtRecoverySource;

  // Materializa recorrências ANTES de buscar transações do mês
  await materializeRecurringTransactions(userId, firstDay, commissionSourceIds);

  // Busca paralela de todos os dados necessários
  const [
    incomes,
    expenses,
    attachments,
    allCommissionsData,
    allSalaryData,
    futureIncomes,
    recentExp,
    recentInc,
    expenseCategories,
    assets,
    liabilities,
    goals,
    cards,
  ] = await Promise.all([
    // Receitas do mês (por competência)
    prisma.income.findMany({
      where: { userId, deletedAt: null, competencyDate: { gte: firstDay, lte: lastDay } },
    }),
    // Despesas do mês (por competência)
    prisma.expense.findMany({
      where: { userId, deletedAt: null, competencyDate: { gte: firstDay, lte: lastDay } },
    }),
    // Anexos do usuário
    prisma.attachment.findMany({ where: { userId } }),
    // Todas as comissões (para cálculo de pendências globais)
    prisma.income.findMany({
      where: { userId, deletedAt: null, incomeSourceId: { in: [...commissionSourceIds] } },
    }),
    // Todos os salários (para cálculo de saldo acumulado a receber)
    prisma.income.findMany({
      where: { userId, deletedAt: null, incomeSourceId: { in: [...salarySourceIds] } },
    }),
    // Comissões futuras
    prisma.income.findMany({
      where: {
        userId,
        deletedAt: null,
        competencyDate: { gt: lastDay },
        incomeSourceId: { in: [...commissionSourceIds] },
      },
      orderBy: { competencyDate: "asc" },
    }),
    // Últimas 5 despesas
    prisma.expense.findMany({
      where: { userId, deletedAt: null },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Últimas 5 receitas
    prisma.income.findMany({
      where: { userId, deletedAt: null },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Categorias de despesa com subcategorias
    prisma.expenseCategory.findMany({
      where: { userId },
      include: { subcategories: true },
    }),
    // Ativos (excluindo soft deleted)
    prisma.asset.findMany({ where: { userId, deletedAt: null } }),
    // Passivos (excluindo soft deleted)
    prisma.liability.findMany({ where: { userId, deletedAt: null } }),
    // Metas (excluindo soft deleted)
    prisma.goal.findMany({ where: { userId, deletedAt: null } }),
    // Cartões ativos
    prisma.card.findMany({
      where: { userId, isActive: true },
      include: { account: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // ── Agregações ─────────────────────────────────────────────────────────────

  let actualIncome = 0;
  let remainingIncome = 0;
  incomes.forEach((i) => {
    actualIncome += i.receivedAmount;
    if (i.status === "expected" || i.status === "partial") {
      // Exclude incomes with no deadline (null or sentinel year 2099+)
      const hasDeadline = i.dueDate && i.dueDate.getFullYear() < 2099;
      if (hasDeadline) remainingIncome += i.expectedAmount - i.receivedAmount;
    }
  });

  let paidExpense = 0;
  let pendingExpense = 0;
  const spentByNature = { essential: 0, important: 0, superfluous: 0 };

  expenses.forEach((e) => {
    paidExpense += e.paidAmount;
    if (e.status === "pending" || e.status === "overdue" || e.status === "partial") {
      pendingExpense += e.amount - e.paidAmount;
    }
    if (e.nature === "essential") spentByNature.essential += e.amount;
    else if (e.nature === "important") spentByNature.important += e.amount;
    else if (e.nature === "superfluous") spentByNature.superfluous += e.amount;
  });

  // Comissões pendentes globais (por IncomeSource.type = "commission")
  const totalExpectedComm = allCommissionsData.reduce((acc, c) => acc + c.expectedAmount, 0);
  const totalReceivedComm = allCommissionsData.reduce((acc, c) => acc + c.receivedAmount, 0);
  const pendingCommissions = Math.max(0, totalExpectedComm - totalReceivedComm);

  // Saldo acumulado de salário a receber da empresa (soma de todos os meses com saldo não recebido)
  const pendingSalaryBalance = allSalaryData.reduce((acc, s) => {
    const remaining = s.expectedAmount - s.receivedAmount;
    return remaining > 0 ? acc + remaining : acc;
  }, 0);

  const receivedCommissionsThisMonth = incomes
    .filter((i) => commissionSourceIds.has(i.incomeSourceId))
    .reduce((acc, i) => acc + i.receivedAmount, 0);

  const totalAccountBalance = accounts.reduce((acc, a) => acc + a.currentBalance, 0);
  const defaultAccount = accounts[0] ?? null;

  const totalAssets = assets.reduce((acc, a) => acc + a.amount, 0);
  const totalLiabilities = liabilities.reduce((acc, l) => acc + l.outstandingAmount, 0);
  const netWorth = totalAssets - totalLiabilities;

  const totalRecurringIncome = incomes
    .filter((i) => i.isRecurring || i.title.toLowerCase().includes("salário"))
    .reduce((acc, i) => acc + i.expectedAmount, 0);
  const totalRecurringExpense = expenses
    .filter((e) => e.isRecurring)
    .reduce((acc, e) => acc + e.amount, 0);

  const projectedBalance = totalAccountBalance + remainingIncome - pendingExpense;

  // ── Transações mapeadas ─────────────────────────────────────────────────────

  const attachmentMap = new Map(attachments.map((a) => [a.relatedEntityId, a.fileUrl]));

  function formatDisplayDate(date: Date): string {
    return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString("pt-BR");
  }

  const mappedTransactions: MappedTransaction[] = [
    ...expenses.map((e) => ({
      id: e.id,
      name: e.title,
      amount: -(e.amount / 100),
      type: "expense" as const,
      date: e.dueDate.toISOString(),
      displayDate: formatDisplayDate(e.dueDate),
      status: e.status as TransactionStatus,
      nature: e.nature,
      categoryId: e.categoryId,
      notes: e.notes,
      isRecurring: e.isRecurring,
      attachmentUrl: attachmentMap.get(e.id),
    })),
    ...incomes.map((i) => {
      // dueDate may be null (no deadline) or sentinel 2099 — use competencyDate as fallback for display
      const effectiveDueDate = (i.dueDate && i.dueDate.getFullYear() < 2099) ? i.dueDate : null;
      return {
        id: i.id,
        name: i.title,
        amount: (i.expectedAmount || i.receivedAmount) / 100,
        type: "income" as const,
        date: (effectiveDueDate ?? i.competencyDate).toISOString(),
        displayDate: effectiveDueDate ? formatDisplayDate(effectiveDueDate) : null,
        status: i.status as TransactionStatus,
        incomeSourceId: i.incomeSourceId,
        isDebtRecovery: i.incomeSourceId === resolvedDebtSource.id,
        notes: i.notes,
        isRecurring: i.isRecurring,
        attachmentUrl: attachmentMap.get(i.id),
      };
    }),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ── Últimas 5 transações globais ─────────────────────────────────────────

  const globalRecent: MappedTransaction[] = [
    ...recentExp.map((e) => ({
      id: e.id,
      name: e.title,
      amount: -(e.amount / 100),
      type: "expense" as const,
      date: e.dueDate.toISOString(),
      displayDate: formatDisplayDate(e.dueDate),
      status: e.status as TransactionStatus,
      createdAt: e.createdAt,
    })),
    ...recentInc.map((i) => ({
      id: i.id,
      name: i.title,
      amount: i.expectedAmount / 100,
      type: "income" as const,
      date: i.dueDate.toISOString(),
      displayDate: formatDisplayDate(i.dueDate),
      status: i.status as TransactionStatus,
      createdAt: i.createdAt,
    })),
  ]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, 5);

  // ── Comissões futuras ─────────────────────────────────────────────────────

  const futureCommissionsMap: Record<string, { month: string; year: number; monthIdx: number; amount: number }> = {};
  futureIncomes.forEach((i) => {
    const key = `${i.competencyDate.getFullYear()}-${i.competencyDate.getUTCMonth()}`;
    const amount = i.expectedAmount - i.receivedAmount;
    if (amount <= 0) return;
    if (!futureCommissionsMap[key]) {
      futureCommissionsMap[key] = {
        month: format(
          new Date(i.competencyDate.getTime() + i.competencyDate.getTimezoneOffset() * 60000),
          "MMMM",
          { locale: ptBR }
        ),
        year: i.competencyDate.getFullYear(),
        monthIdx: i.competencyDate.getUTCMonth(),
        amount: 0,
      };
    }
    futureCommissionsMap[key].amount += amount;
  });

  const futureCommissions = Object.values(futureCommissionsMap)
    .sort((a, b) => a.year * 12 + a.monthIdx - (b.year * 12 + b.monthIdx))
    .map((fc) => ({
      label: `${fc.month.charAt(0).toUpperCase() + fc.month.slice(1)} ${fc.year}`,
      amount: fc.amount / 100,
    }));

  // ── Budget por categoria ──────────────────────────────────────────────────

  const budgetStatus = expenseCategories
    .filter((cat) => cat.budgetLimit > 0)
    .map((cat) => {
      const spentVal = expenses
        .filter((e) => e.categoryId === cat.id)
        .reduce((acc, e) => acc + e.amount, 0);
      return {
        id: cat.id,
        name: cat.name,
        limit: cat.budgetLimit / 100,
        spent: spentVal / 100,
        percent: (spentVal / cat.budgetLimit) * 100,
      };
    });

  return {
    kpis: {
      accountBalance: totalAccountBalance / 100,
      actualIncome: actualIncome / 100,
      remainingIncome: remainingIncome / 100,
      paidExpense: paidExpense / 100,
      pendingExpense: pendingExpense / 100,
      projectedBalance: projectedBalance / 100,
      pendingCommissions: pendingCommissions / 100,
      receivedCommissionsThisMonth: receivedCommissionsThisMonth / 100,
      pendingSalaryBalance: pendingSalaryBalance / 100,
      estimatedFreeBalance: (totalRecurringIncome - totalRecurringExpense) / 100,
      netWorth: netWorth / 100,
      totalAssets: totalAssets / 100,
      totalLiabilities: totalLiabilities / 100,
    },
    spentByNature: {
      essential: spentByNature.essential / 100,
      important: spentByNature.important / 100,
      superfluous: spentByNature.superfluous / 100,
    },
    user: { id: user.id, name: user.name, email: user.email },
    defaultAccountId: defaultAccount?.id,
    recentTransactions: globalRecent,
    allTransactions: mappedTransactions,
    futureCommissions,
    incomeSources,
    debtRecoverySourceId: resolvedDebtSource.id,
    expenseCategories,
    assets,
    liabilities,
    goals,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, balance: a.currentBalance / 100 })),
    budgetStatus,
    cards: cards.map((c) => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      limitAmount: c.limitAmount / 100,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
      accountName: c.account?.name ?? null,
    })),
  };
}

// ─── materializeRecurringTransactions ────────────────────────────────────────
// Chamada separada do getDashboardData para garantir separação de responsabilidade.
// Cria instâncias do mês para cada regra de recorrência ativa se ainda não existirem.

export async function materializeRecurringTransactions(
  userId: string,
  targetMonthDate: Date,
  commissionSourceIds?: Set<string>
) {
  const rules = await prisma.recurringRule.findMany({
    where: { userId, autoCreateEnabled: true },
    include: {
      expenses: { take: 1, orderBy: { createdAt: "asc" } },
      incomes: { take: 1, orderBy: { createdAt: "asc" } },
    },
  });

  for (const rule of rules) {
    if (
      isBefore(targetMonthDate, startOfMonth(rule.startDate)) &&
      !isSameMonth(targetMonthDate, rule.startDate)
    )
      continue;
    if (rule.endDate && isBefore(rule.endDate, targetMonthDate)) continue;

    if (rule.entityType === "expense" && rule.expenses.length > 0) {
      const exists = await prisma.expense.findFirst({
        where: { userId, recurringRuleId: rule.id, competencyDate: targetMonthDate },
      });
      if (!exists) {
        const tpl = rule.expenses[0];
        const newDueDate = new Date(
          targetMonthDate.getFullYear(),
          targetMonthDate.getMonth(),
          tpl.dueDate.getDate()
        );
        await prisma.expense.create({
          data: {
            userId,
            accountId: tpl.accountId,
            categoryId: tpl.categoryId,
            title: tpl.title,
            amount: tpl.amount,
            paidAmount: 0,
            status: "pending",
            paymentMethod: tpl.paymentMethod,
            nature: tpl.nature,
            purchaseDate: new Date(),
            dueDate: newDueDate,
            competencyDate: targetMonthDate,
            isRecurring: true,
            recurringRuleId: rule.id,
            notes: tpl.notes,
          },
        });
      }
    } else if (rule.entityType === "income" && rule.incomes.length > 0) {
      const exists = await prisma.income.findFirst({
        where: { userId, recurringRuleId: rule.id, competencyDate: targetMonthDate },
      });
      if (!exists) {
        const tpl = rule.incomes[0];
        const newDueDate = new Date(
          targetMonthDate.getFullYear(),
          targetMonthDate.getMonth(),
          tpl.dueDate.getDate()
        );
        await prisma.income.create({
          data: {
            userId,
            accountId: tpl.accountId,
            incomeSourceId: tpl.incomeSourceId,
            title: tpl.title,
            expectedAmount: tpl.expectedAmount,
            receivedAmount: 0,
            type: tpl.type,
            status: "expected",
            dueDate: newDueDate,
            competencyDate: targetMonthDate,
            isRecurring: true,
            recurringRuleId: rule.id,
            notes: tpl.notes,
          },
        });
      }
    }
  }
}
