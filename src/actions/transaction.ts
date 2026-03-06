"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createTransaction(formData: FormData) {
    const type = formData.get("type") as string;
    const title = formData.get("title") as string;
    const amountStr = formData.get("amount") as string;
    const accountId = formData.get("accountId") as string;

    const incomeSourceId = formData.get("incomeSourceId") as string;
    const categoryId = formData.get("categoryId") as string;
    const nature = formData.get("nature") as string || "essential";
    const notes = formData.get("notes") as string || "";
    const isPaid = formData.get("isPaid") === "true"; // Checkbox opcional: "Já está pago/recebido"

    const newCategoryName = formData.get("newCategoryName") as string;
    const newSourceName = formData.get("newSourceName") as string;

    // As data vêm de input date (YYYY-MM-DD)
    const dueDateStr = formData.get("dueDate") as string;

    // Parse inteligente de Moeda:
    // Se tem vírgula (ex: 3.000,00), tira todos os pontos e troca vírgula por ponto
    let cleanedString = amountStr;
    if (amountStr.includes(",")) {
        cleanedString = amountStr.replace(/\./g, "").replace(",", ".");
    }
    const amountCentavos = Math.round(parseFloat(cleanedString) * 100);

    const dueDate = new Date(dueDateStr);
    const competencyDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1); // 1º dia do mês de competência

    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Usuário não encontrado");

    if (type === "income") {
        let finalSourceId = incomeSourceId;
        if (finalSourceId === "NEW" && newSourceName) {
            const newSrc = await prisma.incomeSource.create({
                data: { userId: user.id, name: newSourceName, type: "other" }
            });
            finalSourceId = newSrc.id;
        }

        const sourceId = finalSourceId || (await prisma.incomeSource.findFirst({ where: { userId: user.id } }))?.id;
        if (!sourceId) return { error: "Sem fonte de renda para apontar" };

        const currentStatus = isPaid ? "received" : "expected";

        const income = await prisma.income.create({
            data: {
                userId: user.id,
                accountId: accountId,
                incomeSourceId: sourceId,
                title,
                expectedAmount: amountCentavos,
                receivedAmount: isPaid ? amountCentavos : 0,
                type: "other",
                status: currentStatus,
                dueDate,
                receivedDate: isPaid ? new Date() : null,
                competencyDate,
                notes,
            }
        });

        if (isPaid) {
            await prisma.account.update({
                where: { id: accountId },
                data: { currentBalance: { increment: amountCentavos } }
            });
        }
    } else if (type === "expense") {
        let finalCatId = categoryId;
        if (finalCatId === "NEW" && newCategoryName) {
            const newCat = await prisma.expenseCategory.create({
                data: { userId: user.id, name: newCategoryName }
            });
            finalCatId = newCat.id;
        }

        const catId = finalCatId || (await prisma.expenseCategory.findFirst({ where: { userId: user.id } }))?.id;
        if (!catId) return { error: "Sem categoria para apontar" };

        const currentStatus = isPaid ? "paid" : "pending";

        const expense = await prisma.expense.create({
            data: {
                userId: user.id,
                accountId: accountId,
                categoryId: catId,
                title,
                amount: amountCentavos,
                paidAmount: isPaid ? amountCentavos : 0,
                paymentMethod: "pix",
                nature: nature,
                status: currentStatus,
                purchaseDate: new Date(),
                dueDate,
                paidDate: isPaid ? new Date() : null,
                competencyDate,
                notes,
            }
        });

        if (isPaid) {
            await prisma.account.update({
                where: { id: accountId },
                data: { currentBalance: { decrement: amountCentavos } }
            });
        }
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

export async function deleteTransaction(id: string, type: "income" | "expense") {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Usuário não encontrado");

    if (type === "expense") {
        const doc = await prisma.expense.findUnique({ where: { id, userId: user.id } });
        if (doc && doc.status === "paid" && doc.accountId) {
            // Estorna o valor pago da conta
            await prisma.account.update({
                where: { id: doc.accountId },
                data: { currentBalance: { increment: doc.paidAmount } }
            });
        }
        await prisma.expense.delete({ where: { id, userId: user.id } });
    } else {
        const doc = await prisma.income.findUnique({ where: { id, userId: user.id } });
        if (doc && doc.status === "received" && doc.accountId) {
            // Estorna o valor recebido da conta
            await prisma.account.update({
                where: { id: doc.accountId },
                data: { currentBalance: { decrement: doc.receivedAmount } }
            });
        }
        await prisma.income.delete({ where: { id, userId: user.id } });
    }

    revalidatePath("/");
    return { success: true };
}
