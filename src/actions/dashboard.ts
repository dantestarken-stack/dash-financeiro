"use server";

import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";

export async function getDashboardData() {
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

    // 2. Cálculos Reais do Dashboard para o mês atual
    const now = new Date();
    const firstDay = startOfMonth(now);
    const lastDay = endOfMonth(now);

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

    expenses.forEach(e => {
        paidExpense += e.paidAmount;
        if (e.status === "pending" || e.status === "overdue" || e.status === "partial") {
            pendingExpense += (e.amount - e.paidAmount);
        }
    });

    const accountBalance = defaultAccount?.currentBalance || 0;

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
        })),
        ...incomes.map(i => ({
            id: i.id,
            name: i.title,
            amount: i.expectedAmount / 100,
            type: "income",
            date: i.dueDate.toISOString(),
            displayDate: i.dueDate.toLocaleDateString("pt-BR"),
            status: i.status,
        }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
        kpis: {
            accountBalance: accountBalance / 100,
            actualIncome: actualIncome / 100,
            remainingIncome: remainingIncome / 100,
            paidExpense: paidExpense / 100,
            pendingExpense: pendingExpense / 100,
            projectedBalance: projectedBalance / 100,
        },
        user,
        defaultAccountId: defaultAccount?.id,
        recentTransactions: [...mappedTransactions].reverse().slice(0, 5),
        allTransactions: mappedTransactions,
    };
}
