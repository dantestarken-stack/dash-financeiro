"use server";

import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth, addMonths, isBefore, isSameMonth } from "date-fns";

export async function getDashboardData(year?: number, month?: number) {
    // 1. Setup Básico (Se o db estiver zerado, cria usuário local MOCK)
    let user = await prisma.user.findFirst();
    let defaultAccount;

    if (!user) {
        user = await prisma.user.create({
            data: {
                name: "Dante",
                email: "dante.admin@local.com",
                passwordHash: "masterpassword", // só pro mvp
                onboardingCompleted: true,
            },
        });

        defaultAccount = await prisma.account.create({
            data: {
                userId: user.id,
                name: "Conta Corrente",
                type: "checking",
                currentBalance: 0,
            },
        });

        // Cria algumas categorias basicas
        await prisma.expenseCategory.createMany({
            data: [
                { userId: user.id, name: "Moradia", icon: "home" },
                { userId: user.id, name: "Transporte", icon: "car" },
                { userId: user.id, name: "Alimentação", icon: "pizza" },
                { userId: user.id, name: "Assinaturas", icon: "tv" },
            ],
        });

        await prisma.incomeSource.createMany({
            data: [
                { userId: user.id, name: "Empresa Fixa", type: "fixed" },
                { userId: user.id, name: "Comissões", type: "variable" },
            ],
        });
    } else {
        defaultAccount = await prisma.account.findFirst({ where: { userId: user.id } });
    }

    // 2. Cálculos Reais do Dashboard para o mês solicitado ou atual
    let baseDate = new Date();
    if (year !== undefined && month !== undefined) {
        baseDate = new Date(year, month);
    }
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

    // Agregações (Soma em centavos para nao quebrar javascript math).
    let actualIncome = 0;
    let remainingIncome = 0; // expected que nao foi recebida

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

    // Saldo Projetado na regra Ouro: Saldo Atual + A Receber - A Pagar (Tudo referente ao mês)
    const projectedBalance = accountBalance + remainingIncome - pendingExpense;

    const mappedTransactions = [
        ...expenses.map(e => ({
            id: e.id,
            name: e.title,
            amount: -(e.amount / 100),
            type: "expense",
            date: e.dueDate.toISOString(), // toISOString para ordenação precisa no frontend
            displayDate: e.dueDate.toLocaleDateString("pt-BR"),
            status: e.status,
            nature: e.nature, // enviando nature para o client
            notes: e.notes,
            isRecurring: e.isRecurring,
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
        }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const incomeSources = await prisma.incomeSource.findMany({ where: { userId: user.id } });
    const expenseCategories = await prisma.expenseCategory.findMany({ where: { userId: user.id } });

    const assets = await prisma.asset.findMany({ where: { userId: user.id } });
    const liabilities = await prisma.liability.findMany({ where: { userId: user.id } });

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
        user,
        defaultAccountId: defaultAccount?.id,
        recentTransactions: [...mappedTransactions].reverse().slice(0, 5),
        allTransactions: mappedTransactions,
        incomeSources,
        expenseCategories,
        assets,
        liabilities,
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
        // Ignorar se a regra começou depois do mês alvo
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
