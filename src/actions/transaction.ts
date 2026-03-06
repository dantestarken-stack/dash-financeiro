"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createTransaction(formData: FormData) {
    const type = formData.get("type") as string;
    const title = formData.get("title") as string;
    const amountStr = formData.get("amount") as string;
    const accountId = formData.get("accountId") as string;

    // As data vêm de input date (YYYY-MM-DD)
    const dueDateStr = formData.get("dueDate") as string;

    // Convertendo decimal R$ (ex: 15.50) para centavos int 1550
    const amountCentavos = Math.round(parseFloat(amountStr.replace(",", ".")) * 100);

    const dueDate = new Date(dueDateStr);
    const competencyDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1); // 1º dia do mês de competência

    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Usuário não encontrado");

    if (type === "income") {
        const incomeSource = await prisma.incomeSource.findFirst({ where: { userId: user.id } });
        if (!incomeSource) return { error: "Sem fonte de renda para apontar" };

        await prisma.income.create({
            data: {
                userId: user.id,
                accountId: accountId,
                incomeSourceId: incomeSource.id,
                title,
                expectedAmount: amountCentavos,
                receivedAmount: 0,
                type: "other",
                status: "expected", // Inicia como previsto, pra n entrar no real logo de cara
                dueDate,
                competencyDate,
            }
        });
    } else if (type === "expense") {
        const category = await prisma.expenseCategory.findFirst({ where: { userId: user.id } });
        if (!category) return { error: "Sem categoria para apontar" };

        await prisma.expense.create({
            data: {
                userId: user.id,
                accountId: accountId,
                categoryId: category.id,
                title,
                amount: amountCentavos,
                paidAmount: 0,
                paymentMethod: "pix",
                nature: "essential",
                status: "pending",
                purchaseDate: new Date(),
                dueDate,
                competencyDate,
            }
        });
    }

    // Após injetar no banco, forçamos o Nextjs a re-renderizar a página recarregando os dados.
    revalidatePath("/");
    return { success: true };
}

export async function markTransactionAsPaid(id: string, type: "income" | "expense") {
    if (type === "income") {
        const inc = await prisma.income.findUnique({ where: { id } });
        if (inc) {
            await prisma.income.update({
                where: { id },
                data: {
                    status: "received",
                    receivedAmount: inc.expectedAmount,
                    receivedDate: new Date()
                }
            });
            // Update account balance
            await prisma.account.update({
                where: { id: inc.accountId },
                data: { currentBalance: { increment: inc.expectedAmount } }
            });
        }
    } else {
        const exp = await prisma.expense.findUnique({ where: { id } });
        if (exp && exp.accountId) {
            await prisma.expense.update({
                where: { id },
                data: {
                    status: "paid",
                    paidAmount: exp.amount,
                    paidDate: new Date()
                }
            });
            // Update account balance
            await prisma.account.update({
                where: { id: exp.accountId },
                data: { currentBalance: { decrement: exp.amount } }
            });
        }
    }

    revalidatePath("/");
    return { success: true };
}
