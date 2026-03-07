"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    const session = await decrypt(token);
    return session.userId;
}

export async function createTransaction(formData: FormData) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    const type = formData.get("type") as string;
    const title = formData.get("title") as string;
    const amountStr = formData.get("amount") as string;
    const accountId = formData.get("accountId") as string;
    const categoryId = formData.get("categoryId") as string;
    const incomeSourceId = formData.get("incomeSourceId") as string;
    const nature = formData.get("nature") as string || "essential";
    const notes = formData.get("notes") as string || "";
    const isPaid = formData.get("isPaid") === "true";
    const isRecurring = formData.get("isRecurring") === "true";
    const dueDateStr = formData.get("dueDate") as string;

    const file = formData.get("attachment") as File;

    let cleanedString = amountStr;
    if (amountStr.includes(",")) {
        cleanedString = amountStr.replace(/\./g, "").replace(",", ".");
    }
    const amountCentavos = Math.round(parseFloat(cleanedString) * 100);

    const dueDate = new Date(dueDateStr);
    const competencyDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);

    let transactionId = "";
    let entityType = "";

    if (type === "income") {
        entityType = "income";
        const income = await prisma.income.create({
            data: {
                userId,
                accountId,
                incomeSourceId,
                title,
                expectedAmount: amountCentavos,
                receivedAmount: isPaid ? amountCentavos : 0,
                type: "other",
                status: isPaid ? "received" : "expected",
                dueDate,
                receivedDate: isPaid ? new Date() : null,
                competencyDate,
                notes,
                isRecurring,
            }
        });
        transactionId = income.id;

        if (isRecurring) {
            await prisma.recurringRule.create({
                data: {
                    userId,
                    entityType: "income",
                    frequency: "monthly",
                    startDate: dueDate,
                    nextRunDate: addMonths(dueDate, 1),
                    incomes: { connect: { id: income.id } }
                }
            });
        }

        if (isPaid) {
            await prisma.account.update({
                where: { id: accountId },
                data: { currentBalance: { increment: amountCentavos } }
            });
        }
    } else {
        entityType = "expense";
        const expense = await prisma.expense.create({
            data: {
                userId,
                accountId,
                categoryId,
                title,
                amount: amountCentavos,
                paidAmount: isPaid ? amountCentavos : 0,
                paymentMethod: "other",
                nature,
                status: isPaid ? "paid" : "pending",
                purchaseDate: new Date(),
                dueDate,
                paidDate: isPaid ? new Date() : null,
                competencyDate,
                notes,
                isRecurring,
            }
        });
        transactionId = expense.id;

        if (isRecurring) {
            await prisma.recurringRule.create({
                data: {
                    userId,
                    entityType: "expense",
                    frequency: "monthly",
                    startDate: dueDate,
                    nextRunDate: addMonths(dueDate, 1),
                    expenses: { connect: { id: expense.id } }
                }
            });
        }

        if (isPaid) {
            await prisma.account.update({
                where: { id: accountId },
                data: { currentBalance: { decrement: amountCentavos } }
            });
        }
    }

    // Handle Attachment
    if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString("base64");
        const dataUrl = `data:${file.type};base64,${base64}`;

        await prisma.attachment.create({
            data: {
                userId,
                relatedEntityType: entityType,
                relatedEntityId: transactionId,
                fileName: file.name,
                fileUrl: dataUrl,
                mimeType: file.type,
                fileSize: file.size,
            }
        });
    }

    revalidatePath("/");
    return { success: true };
}

export async function markTransactionAsPaid(id: string, type: "income" | "expense") {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    if (type === "income") {
        const inc = await prisma.income.findUnique({ where: { id, userId } });
        if (inc) {
            await prisma.income.update({
                where: { id },
                data: {
                    status: "received",
                    receivedAmount: inc.expectedAmount,
                    receivedDate: new Date()
                }
            });
            await prisma.account.update({
                where: { id: inc.accountId },
                data: { currentBalance: { increment: inc.expectedAmount } }
            });
        }
    } else {
        const exp = await prisma.expense.findUnique({ where: { id, userId } });
        if (exp && exp.accountId) {
            await prisma.expense.update({
                where: { id },
                data: {
                    status: "paid",
                    paidAmount: exp.amount,
                    paidDate: new Date()
                }
            });
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
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    if (type === "expense") {
        const doc = await prisma.expense.findUnique({ where: { id, userId } });
        if (doc && doc.status === "paid" && doc.accountId) {
            await prisma.account.update({
                where: { id: doc.accountId },
                data: { currentBalance: { increment: doc.paidAmount } }
            });
        }
        await prisma.expense.delete({ where: { id, userId } });
    } else {
        const doc = await prisma.income.findUnique({ where: { id, userId } });
        if (doc && doc.status === "received" && doc.accountId) {
            await prisma.account.update({
                where: { id: doc.accountId },
                data: { currentBalance: { decrement: doc.receivedAmount } }
            });
        }
        await prisma.income.delete({ where: { id, userId } });
    }

    revalidatePath("/");
    return { success: true };
}
