"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { requireUserId } from "@/lib/session";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCentavos(value: string): number {
    const cleaned = value.includes(",")
        ? value.replace(/\./g, "").replace(",", ".")
        : value;
    const num = parseFloat(cleaned);
    if (isNaN(num) || num < 0) throw new Error("Valor monetário inválido: " + value);
    return Math.round(num * 100);
}

// ─── createTransaction ────────────────────────────────────────────────────────

export async function createTransaction(formData: FormData) {
    const userId = await requireUserId();

    const type = formData.get("type") as string;
    const title = formData.get("title") as string;
    const accountId = formData.get("accountId") as string;
    const nature = (formData.get("nature") as string) || "essential";
    const notes = (formData.get("notes") as string) || "";
    const isPaid = formData.get("isPaid") === "true";
    const isRecurring = formData.get("isRecurring") === "true";
    const dueDateStr = formData.get("dueDate") as string;
    const file = formData.get("attachment") as File;

    if (!title || !accountId || !dueDateStr) {
        throw new Error("Campos obrigatórios ausentes.");
    }

    const totalAmountCentavos = parseCentavos(formData.get("amount") as string);
    const dueDate = new Date(dueDateStr);
    const competencyDate = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1));

    let transactionId = "";
    let entityType = "";

    // ── RECEITA ───────────────────────────────────────────────────────────────
    if (type === "income") {
        entityType = "income";

        const incomeSourceId = formData.get("incomeSourceId") as string;
        const isCommissionReceipt = formData.get("isCommissionReceipt") === "true";
        const abatementCentavos = formData.get("abatement")
            ? parseCentavos(formData.get("abatement") as string)
            : 0;

        const expAmount = isCommissionReceipt ? 0 : totalAmountCentavos;
        const recAmount = (isPaid || isCommissionReceipt) ? totalAmountCentavos : abatementCentavos;
        const finalStatus = (isPaid || isCommissionReceipt)
            ? "received"
            : abatementCentavos > 0 ? "partial" : "expected";

        // Operação atômica: cria receita + regra de recorrência + atualiza saldo
        await prisma.$transaction(async (tx) => {
            const income = await tx.income.create({
                data: {
                    userId,
                    accountId,
                    incomeSourceId,
                    title,
                    expectedAmount: expAmount,
                    receivedAmount: recAmount,
                    type: "other",
                    status: finalStatus,
                    dueDate,
                    receivedDate: recAmount > 0 ? new Date() : null,
                    competencyDate,
                    notes,
                    isRecurring,
                }
            });
            transactionId = income.id;

            if (isRecurring) {
                await tx.recurringRule.create({
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

            if (recAmount > 0) {
                await tx.account.update({
                    where: { id: accountId },
                    data: { currentBalance: { increment: recAmount } }
                });
            }
        });

    // ── DESPESA ───────────────────────────────────────────────────────────────
    } else {
        entityType = "expense";
        const categoryId = formData.get("categoryId") as string;
        const isInstallment = formData.get("isInstallment") === "true";
        const installmentsCount = parseInt((formData.get("installmentsCount") as string) || "1");

        if (isInstallment && installmentsCount > 1) {
            // PRD US10: o usuário informa o VALOR TOTAL, o sistema divide
            const installmentAmount = Math.floor(totalAmountCentavos / installmentsCount);
            const remainder = totalAmountCentavos % installmentsCount;

            await prisma.$transaction(async (tx) => {
                const group = await tx.installmentGroup.create({
                    data: {
                        userId,
                        title,
                        totalAmount: totalAmountCentavos,
                        totalInstallments: installmentsCount,
                        firstDueDate: dueDate,
                        accountId,
                    }
                });

                for (let i = 1; i <= installmentsCount; i++) {
                    const currentDueDate = addMonths(dueDate, i - 1);
                    // O resto vai para a 1ª parcela, garantindo que a soma bate com o total
                    const currentAmount = i === 1 ? installmentAmount + remainder : installmentAmount;
                    const currentPaid = i === 1 && isPaid ? currentAmount : 0;

                    const exp = await tx.expense.create({
                        data: {
                            userId,
                            accountId,
                            categoryId,
                            title: `${title} (${i}/${installmentsCount})`,
                            amount: currentAmount,
                            paidAmount: currentPaid,
                            paymentMethod: "other",
                            nature,
                            status: currentPaid > 0 ? "paid" : "pending",
                            purchaseDate: new Date(),
                            dueDate: currentDueDate,
                            paidDate: currentPaid > 0 ? new Date() : null,
                            competencyDate: new Date(Date.UTC(currentDueDate.getUTCFullYear(), currentDueDate.getUTCMonth(), 1)),
                            notes,
                            isInstallment: true,
                            installmentGroupId: group.id,
                            installmentNumber: i,
                            totalInstallments: installmentsCount,
                        }
                    });

                    if (i === 1) transactionId = exp.id;

                    if (currentPaid > 0 && accountId) {
                        await tx.account.update({
                            where: { id: accountId },
                            data: { currentBalance: { decrement: currentPaid } }
                        });
                    }
                }
            });

        } else {
            // Despesa simples (não parcelada)
            await prisma.$transaction(async (tx) => {
                const expense = await tx.expense.create({
                    data: {
                        userId,
                        accountId,
                        categoryId,
                        title,
                        amount: totalAmountCentavos,
                        paidAmount: isPaid ? totalAmountCentavos : 0,
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
                    await tx.recurringRule.create({
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

                if (isPaid && accountId) {
                    await tx.account.update({
                        where: { id: accountId },
                        data: { currentBalance: { decrement: totalAmountCentavos } }
                    });
                }
            });
        }
    }

    // ── ANEXO ─────────────────────────────────────────────────────────────────
    if (file && file.size > 0) {
        const uploadForm = new FormData();
        uploadForm.append("file", file);

        const uploadRes = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/upload`,
            { method: "POST", body: uploadForm }
        );

        if (uploadRes.ok) {
            const { url } = await uploadRes.json() as { url: string };
            await prisma.attachment.create({
                data: {
                    userId,
                    relatedEntityType: entityType,
                    relatedEntityId: transactionId,
                    fileName: file.name,
                    fileUrl: url,
                    mimeType: file.type,
                    fileSize: file.size,
                }
            });
        }
    }

    revalidatePath("/");
    return { success: true };
}

// ─── markTransactionAsPaid ────────────────────────────────────────────────────

export async function markTransactionAsPaid(id: string, type: "income" | "expense") {
    const userId = await requireUserId();

    await prisma.$transaction(async (tx) => {
        if (type === "income") {
            const inc = await tx.income.findUnique({ where: { id, userId } });
            if (!inc) return;
            await tx.income.update({
                where: { id },
                data: {
                    status: "received",
                    receivedAmount: inc.expectedAmount,
                    receivedDate: new Date()
                }
            });
            await tx.account.update({
                where: { id: inc.accountId },
                data: { currentBalance: { increment: inc.expectedAmount } }
            });
        } else {
            const exp = await tx.expense.findUnique({ where: { id, userId } });
            if (!exp || !exp.accountId) return;
            await tx.expense.update({
                where: { id },
                data: {
                    status: "paid",
                    paidAmount: exp.amount,
                    paidDate: new Date()
                }
            });
            await tx.account.update({
                where: { id: exp.accountId },
                data: { currentBalance: { decrement: exp.amount } }
            });
        }
    });

    revalidatePath("/");
    return { success: true };
}

// ─── deleteTransaction ────────────────────────────────────────────────────────

export async function deleteTransaction(id: string, type: "income" | "expense") {
    const userId = await requireUserId();

    await prisma.$transaction(async (tx) => {
        if (type === "expense") {
            const doc = await tx.expense.findUnique({ where: { id, userId } });
            if (!doc || doc.deletedAt) return;

            if (doc.status === "paid" && doc.accountId) {
                await tx.account.update({
                    where: { id: doc.accountId },
                    data: { currentBalance: { increment: doc.paidAmount } }
                });
            }
            await tx.expense.update({
                where: { id, userId },
                data: { deletedAt: new Date() }
            });
        } else {
            const doc = await tx.income.findUnique({ where: { id, userId } });
            if (!doc || doc.deletedAt) return;

            if (doc.status === "received" && doc.accountId) {
                await tx.account.update({
                    where: { id: doc.accountId },
                    data: { currentBalance: { decrement: doc.receivedAmount } }
                });
            }
            await tx.income.update({
                where: { id, userId },
                data: { deletedAt: new Date() }
            });
        }
    });

    revalidatePath("/");
    return { success: true };
}
