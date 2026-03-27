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
    const userId = users[0].id;

    if (action === "fix330") {
        // Fix the R$330 phantom balance from the deleted partial income
        const accounts = await prisma.account.findMany({ where: { userId } });
        if (!accounts.length) return NextResponse.json({ error: "no accounts" });
        const account = accounts[0];
        await prisma.account.update({
            where: { id: account.id },
            data: { currentBalance: { decrement: 33000 } } // deduct R$330 in centavos
        });
        const updated = await prisma.account.findUnique({ where: { id: account.id } });
        return NextResponse.json({
            ok: true,
            message: "Subtracted R$330 from account balance",
            newBalance: (updated!.currentBalance / 100).toFixed(2)
        });
    }

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
        accounts: accounts.map(a => ({
            id: a.id, name: a.name, balance: a.currentBalance / 100,
        })),
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
