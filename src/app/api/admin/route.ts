import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SECRET = "dash-admin-2026-tmp";

export async function GET(req: NextRequest) {
    if (req.nextUrl.searchParams.get("key") !== SECRET) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    if (!users.length) return NextResponse.json({ error: "no users" });
    const userId = users[0].id;

    const [accounts, incomes, expenses] = await Promise.all([
        prisma.account.findMany({ where: { userId } }),
        prisma.income.findMany({
            where: { userId, deletedAt: null },
            orderBy: { dueDate: "desc" },
            take: 50,
            include: { incomeSource: { select: { name: true, type: true } } }
        }),
        prisma.expense.findMany({
            where: { userId, deletedAt: null },
            orderBy: { dueDate: "desc" },
            take: 50,
            include: { category: { select: { name: true } } }
        }),
    ]);

    return NextResponse.json({
        accounts: accounts.map(a => ({
            name: a.name,
            balance: a.currentBalance / 100,
        })),
        incomes: incomes.map(i => ({
            title: i.title,
            source: i.incomeSource?.name,
            sourceType: i.incomeSource?.type,
            expected: i.expectedAmount / 100,
            received: i.receivedAmount / 100,
            status: i.status,
            dueDate: i.dueDate?.toISOString().split("T")[0],
            competency: i.competencyDate?.toISOString().split("T")[0],
        })),
        expenses: expenses.map(e => ({
            title: e.title,
            category: e.category?.name,
            amount: e.amount / 100,
            paid: e.paidAmount / 100,
            status: e.status,
            nature: e.nature,
            dueDate: e.dueDate?.toISOString().split("T")[0],
            competency: e.competencyDate?.toISOString().split("T")[0],
        })),
    });
}
