/**
 * GET /api/export?month=N&year=N&type=all|income|expense
 * Exporta as transações do mês em formato CSV com BOM UTF-8 para compatibilidade com Excel.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  // Envolve em aspas se contiver vírgula, aspas ou quebra de linha
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = session.userId as string;
  const { searchParams } = req.nextUrl;

  const now = new Date();
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth()), 10);
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()), 10);
  const type = searchParams.get("type") ?? "all"; // "all" | "income" | "expense"

  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const rows: string[] = [];

  // Cabeçalho
  const header = ["Data", "Tipo", "Título", "Categoria/Fonte", "Valor (R$)", "Status", "Natureza", "Notas"].join(",");
  rows.push(header);

  function formatDate(date: Date | null): string {
    if (!date) return "Sem prazo";
    return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString("pt-BR");
  }

  if (type === "all" || type === "expense") {
    const expenses = await prisma.expense.findMany({
      where: { userId, deletedAt: null, competencyDate: { gte: firstDay, lte: lastDay } },
      include: { category: true },
      orderBy: { dueDate: "asc" },
    });

    expenses.forEach((e) => {
      rows.push([
        escapeCSV(formatDate(e.dueDate)),
        "Despesa",
        escapeCSV(e.title),
        escapeCSV(e.category?.name ?? ""),
        escapeCSV(`-${formatBRL(e.amount)}`),
        escapeCSV(e.status),
        escapeCSV(e.nature),
        escapeCSV(e.notes ?? ""),
      ].join(","));
    });
  }

  if (type === "all" || type === "income") {
    const incomes = await prisma.income.findMany({
      where: { userId, deletedAt: null, competencyDate: { gte: firstDay, lte: lastDay } },
      include: { incomeSource: true },
      orderBy: { dueDate: "asc" },
    });

    incomes.forEach((i) => {
      rows.push([
        escapeCSV(formatDate(i.dueDate)),
        "Receita",
        escapeCSV(i.title),
        escapeCSV(i.incomeSource?.name ?? ""),
        escapeCSV(formatBRL(i.expectedAmount || i.receivedAmount)),
        escapeCSV(i.status),
        "",
        escapeCSV(i.notes ?? ""),
      ].join(","));
    });
  }

  // BOM UTF-8 para compatibilidade com Excel
  const bom = "\uFEFF";
  const csv = bom + rows.join("\n");

  const monthStr = String(month + 1).padStart(2, "0");
  const filename = `financas_${year}_${monthStr}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
