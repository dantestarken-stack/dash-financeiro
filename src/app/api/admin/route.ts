import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SECRET = "dash-admin-2026-tmp";

export async function GET(req: NextRequest) {
    if (req.nextUrl.searchParams.get("key") !== SECRET) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const action = req.nextUrl.searchParams.get("action") || "read";
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    if (!users.length) return NextResponse.json({ error: "no users" });

    // Find the user that actually has accounts (not just users[0])
    let userId = users[0].id;
    for (const u of users) {
        const count = await prisma.account.count({ where: { userId: u.id } });
        if (count > 0) { userId = u.id; break; }
    }

    // ── Fix R$330 phantom balance ─────────────────────────────────────────────
    if (action === "fix330") {
        const accounts = await prisma.account.findMany({ where: { userId } });
        if (!accounts.length) return NextResponse.json({ error: "no accounts" });
        const account = accounts[0];
        await prisma.account.update({
            where: { id: account.id },
            data: { currentBalance: { decrement: 33000 } }
        });
        const updated = await prisma.account.findUnique({ where: { id: account.id } });
        return NextResponse.json({ ok: true, action: "fix330", newBalance: (updated!.currentBalance / 100).toFixed(2) });
    }

    // ── Fix salary: mark as partial (3000 received, 500 pending) ─────────────
    if (action === "fixSalary") {
        const amountReceived = parseInt(req.nextUrl.searchParams.get("received") || "300000"); // centavos
        // Find the salary income for current month
        const now = new Date();
        const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

        // Support direct ID lookup or fall back to source type search
        const incomeId = req.nextUrl.searchParams.get("id");
        const salaryIncome = incomeId
            ? await prisma.income.findUnique({ where: { id: incomeId } })
            : await prisma.income.findFirst({
                where: {
                    userId, deletedAt: null,
                    competencyDate: { gte: firstDay, lte: lastDay },
                    incomeSource: { type: "salary" }
                },
                include: { incomeSource: true }
            });

        if (!salaryIncome) return NextResponse.json({ error: "Income not found", hint: "Pass &id=<income_id> from the read action" });

        const previouslyReceived = salaryIncome.receivedAmount;
        const diff = previouslyReceived - amountReceived; // amount to deduct from account

        await prisma.$transaction(async (tx) => {
            await tx.income.update({
                where: { id: salaryIncome.id },
                data: {
                    status: amountReceived >= salaryIncome.expectedAmount ? "received" : "partial",
                    receivedAmount: amountReceived,
                }
            });
            if (diff > 0 && salaryIncome.accountId) {
                await tx.account.update({
                    where: { id: salaryIncome.accountId },
                    data: { currentBalance: { decrement: diff } }
                });
            }
        });

        const account = await prisma.account.findUnique({ where: { id: salaryIncome.accountId! } });
        return NextResponse.json({
            ok: true,
            action: "fixSalary",
            income: salaryIncome.title,
            expected: salaryIncome.expectedAmount / 100,
            previouslyReceived: previouslyReceived / 100,
            nowReceived: amountReceived / 100,
            accountAdjustment: -diff / 100,
            newAccountBalance: account ? account.currentBalance / 100 : "unknown"
        });
    }

    // ── Read all data ─────────────────────────────────────────────────────────
    const [accounts, incomes, expenses] = await Promise.all([
        prisma.account.findMany({ where: { userId } }),
        prisma.income.findMany({
            where: { userId, deletedAt: null },
            orderBy: { dueDate: "desc" },
            take: 60,
            include: { incomeSource: { select: { name: true, type: true } } }
        }),
        prisma.expense.findMany({
            where: { userId, deletedAt: null },
            orderBy: { dueDate: "desc" },
            take: 60,
            include: { category: { select: { name: true } } }
        }),
    ]);

    return NextResponse.json({
        users: users.map(u => ({ id: u.id, name: u.name })),
        accounts: accounts.map(a => ({ id: a.id, name: a.name, balance: a.currentBalance / 100 })),
        incomes: incomes.map(i => ({
            id: i.id, title: i.title,
            source: i.incomeSource?.name, sourceType: i.incomeSource?.type,
            expected: i.expectedAmount / 100, received: i.receivedAmount / 100,
            status: i.status,
            dueDate: i.dueDate?.toISOString().split("T")[0],
            competency: i.competencyDate?.toISOString().split("T")[0],
        })),
        expenses: expenses.map(e => ({
            id: e.id, title: e.title, category: e.category?.name,
            amount: e.amount / 100, paid: e.paidAmount / 100,
            status: e.status, nature: e.nature,
            dueDate: e.dueDate?.toISOString().split("T")[0],
            competency: e.competencyDate?.toISOString().split("T")[0],
        })),
    });
}
