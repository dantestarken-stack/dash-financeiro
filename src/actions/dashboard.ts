"use server";

import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth, addMonths, isBefore, isSameMonth } from "date-fns";

export async function getDashboardData(year: number, month: number, userId: string) {
    // 1. Setup Básico
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Usuário não encontrado.");

    const defaultAccount = await prisma.account.findFirst({ where: { userId } });

    // 2. Cálculos Reais do Dashboard para o mês solicitado
    const baseDate = new Date(year, month);
    const firstDay = startOfMonth(baseDate);
    const lastDay = endOfMonth(baseDate);

    // 2.1 Regra de Recorrência (Criação Dinâmica se não existir no mês)
    await materializeRecurringTransactions(user.id, firstDay);

    // Receitas (Dentro do mes de competencia)
    const incomes = await prisma.income.findMany({
        where: {
            userId: user.id,
            competencyDate: { gte: firstDay, lte: lastDay },
        },
    });

    // Despesas (Mês)
    const expenses = await prisma.expense.findMany({
        where: {
            userId: user.id,
            competencyDate: { gte: firstDay, lte: lastDay },
        },
    });

    // Attachments
    const attachments = await prisma.attachment.findMany({
        where: { userId: user.id }
    });

    // Agregações (Soma em centavos para nao quebrar javascript math).
    let actualIncome = 0;
    let remainingIncome = 0;

    incomes.forEach(i => {
        actualIncome += i.receivedAmount;
        if (i.status === "expected" || i.status === "partial") {
            remainingIncome += (i.expectedAmount - i.receivedAmount);
        }
    });

    let paidExpense = 0;
    let pendingExpense = 0;

    let spentByNature = {
        essential: 0,
        important: 0,
        superfluous: 0
    };

    expenses.forEach(e => {
        paidExpense += e.paidAmount;
        if (e.status === "pending" || e.status === "overdue" || e.status === "partial") {
            pendingExpense += (e.amount - e.paidAmount);
        }

        if (e.nature === "essential") spentByNature.essential += e.amount;
        else if (e.nature === "important") spentByNature.important += e.amount;
        else if (e.nature === "superfluous") spentByNature.superfluous += e.amount;
    });

    const accountBalance = defaultAccount?.currentBalance || 0;

    // Calculo específico para comissões a receber no mês
    const pendingCommissions = incomes
        .filter(i => i.title.toLowerCase().includes("comissão") && (i.status === "expected" || i.status === "partial"))
        .reduce((acc, curr) => acc + (curr.expectedAmount - curr.receivedAmount), 0);

    // Saldo Projetado: Saldo Atual + A Receber - A Pagar
    const projectedBalance = accountBalance + remainingIncome - pendingExpense;

    const mappedTransactions = [
        ...expenses.map(e => ({
            id: e.id,
            name: e.title,
            amount: -(e.amount / 100),
            type: "expense",
            date: e.dueDate.toISOString(),
            displayDate: e.dueDate.toLocaleDateString("pt-BR"),
            status: e.status,
            nature: e.nature,
            notes: e.notes,
            isRecurring: e.isRecurring,
            attachmentUrl: attachments.find(a => a.relatedEntityId === e.id)?.fileUrl
        })),
        ...incomes.map(i => ({
            id: i.id,
            name: i.title,
            amount: i.expectedAmount / 100,
            type: "income",
            date: i.dueDate.toISOString(),
            displayDate: i.dueDate.toLocaleDateString("pt-BR"),
            status: i.status,
            notes: i.notes,
            isRecurring: i.isRecurring,
            attachmentUrl: attachments.find(a => a.relatedEntityId === i.id)?.fileUrl
        }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const incomeSources = await prisma.incomeSource.findMany({ where: { userId: user.id } });
    const expenseCategories = await prisma.expenseCategory.findMany({ where: { userId: user.id } });
    const assets = await prisma.asset.findMany({ where: { userId: user.id } });
    const liabilities = await prisma.liability.findMany({ where: { userId: user.id } });
    const goals = await prisma.goal.findMany({ where: { userId: user.id } });

    // Budget Progress
    const budgetStatus = expenseCategories.map(cat => {
        const spentVal = expenses
            .filter(e => e.categoryId === cat.id)
            .reduce((acc, curr) => acc + curr.amount, 0);

        return {
            id: cat.id,
            name: cat.name,
            limit: cat.budgetLimit / 100,
            spent: spentVal / 100,
            percent: cat.budgetLimit > 0 ? (spentVal / cat.budgetLimit) * 100 : 0
        };
    }).filter(c => c.limit > 0);

    const totalAssets = assets.reduce((acc, curr) => acc + curr.amount, 0);
    const totalLiabilities = liabilities.reduce((acc, curr) => acc + curr.outstandingAmount, 0);
    const netWorth = totalAssets - totalLiabilities;

    return {
        kpis: {
            accountBalance: accountBalance / 100,
            actualIncome: actualIncome / 100,
            remainingIncome: remainingIncome / 100,
            paidExpense: paidExpense / 100,
            pendingExpense: pendingExpense / 100,
            projectedBalance: projectedBalance / 100,
            pendingCommissions: pendingCommissions / 100,
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
        recentTransactions: [...mappedTransactions].reverse().slice(0, 5),
        allTransactions: mappedTransactions,
        incomeSources,
        expenseCategories,
        assets,
        liabilities,
        goals,
        budgetStatus,
    };
}

async function materializeRecurringTransactions(userId: string, targetMonthDate: Date) {
    const rules = await prisma.recurringRule.findMany({
        where: { userId, autoCreateEnabled: true },
        include: {
            expenses: { take: 1, orderBy: { createdAt: 'asc' } },
            incomes: { take: 1, orderBy: { createdAt: 'asc' } }
        }
    });

    for (const rule of rules) {
        if (isBefore(targetMonthDate, startOfMonth(rule.startDate)) && !isSameMonth(targetMonthDate, rule.startDate)) continue;
        if (rule.endDate && isBefore(rule.endDate, targetMonthDate)) continue;

        if (rule.entityType === "expense" && rule.expenses.length > 0) {
            const exists = await prisma.expense.findFirst({
                where: { userId, recurringRuleId: rule.id, competencyDate: targetMonthDate }
            });

            if (!exists) {
                const template = rule.expenses[0];
                const newDueDate = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), template.dueDate.getDate());

                await prisma.expense.create({
                    data: {
                        userId,
                        accountId: template.accountId,
                        categoryId: template.categoryId,
                        title: template.title,
                        amount: template.amount,
                        paidAmount: 0,
                        status: "pending",
                        paymentMethod: template.paymentMethod,
                        nature: template.nature,
                        purchaseDate: new Date(),
                        dueDate: newDueDate,
                        competencyDate: targetMonthDate,
                        isRecurring: true,
                        recurringRuleId: rule.id,
                        notes: template.notes
                    }
                });
            }
        } else if (rule.entityType === "income" && rule.incomes.length > 0) {
            const exists = await prisma.income.findFirst({
                where: { userId, recurringRuleId: rule.id, competencyDate: targetMonthDate }
            });

            if (!exists) {
                const template = rule.incomes[0];
                const newDueDate = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), template.dueDate.getDate());

                await prisma.income.create({
                    data: {
                        userId,
                        accountId: template.accountId,
                        incomeSourceId: template.incomeSourceId,
                        title: template.title,
                        expectedAmount: template.expectedAmount,
                        receivedAmount: 0,
                        type: template.type,
                        status: "expected",
                        dueDate: newDueDate,
                        competencyDate: targetMonthDate,
                        isRecurring: true,
                        recurringRuleId: rule.id,
                        notes: template.notes
                    }
                });
            }
        }
    }
}
