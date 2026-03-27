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

    // dueDate is required for expenses but optional for incomes (defaults to last day of current month)
    if (!title || !accountId) {
        throw new Error("Campos obrigatórios ausentes.");
    }
    if (type === "expense" && !dueDateStr) {
        throw new Error("Data de vencimento obrigatória para despesas.");
    }

    const totalAmountCentavos = parseCentavos(formData.get("amount") as string);
    const chargeCompany = formData.get("chargeCompany") === "true"; // Cobrar da empresa (gera reembolso pendente)

    let dueDate: Date;
    if (dueDateStr) {
        dueDate = new Date(dueDateStr);
    } else {
        // Default to last day of current month for incomes without a due date
        const now = new Date();
        dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    }
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

    // ── REEMBOLSO EMPRESA ─────────────────────────────────────────────────────
    // When chargeCompany=true on an expense, auto-create a pending income so
    // the reimbursement shows up in "Dinheiro na Mesa".
    if (chargeCompany && type === "expense" && accountId) {
        // Find or create the "Reembolso Empresa" income source
        let reimbursementSource = await prisma.incomeSource.findFirst({
            where: { userId, type: "reimbursement" },
        });
        if (!reimbursementSource) {
            reimbursementSource = await prisma.incomeSource.create({
                data: {
                    userId,
                    name: "Reembolso Empresa",
                    type: "reimbursement",
                    isActive: true,
                },
            });
        }
        // Competency = current month (reimbursement has no fixed deadline)
        const now = new Date();
        const reimbCompetency = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const sentinelDate = new Date(Date.UTC(2099, 11, 31)); // no deadline
        await prisma.income.create({
            data: {
                userId,
                accountId,
                incomeSourceId: reimbursementSource.id,
                title: `Reembolso - ${title}`,
                expectedAmount: totalAmountCentavos,
                receivedAmount: 0,
                type: "reimbursement",
                status: "expected",
                dueDate: sentinelDate,
                competencyDate: reimbCompetency,
                notes: `Gerado automaticamente ao lançar despesa "${title}"`,
            },
        });
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
            // For partial incomes, only credit the remaining balance (expected - already received)
            const remainingAmount = inc.expectedAmount - (inc.receivedAmount ?? 0);
            const creditAmount = inc.status === "partial" ? remainingAmount : inc.expectedAmount;
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
                data: { currentBalance: { increment: creditAmount } }
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

// ─── updateTransaction ────────────────────────────────────────────────────────

export async function updateTransaction(
    id: string,
    type: "income" | "expense",
    data: {
        title?: string;
        nature?: string;
        categoryId?: string;
        notes?: string;
        status?: string;
        amount?: number; // in centavos
        date?: string;
    }
) {
    const userId = await requireUserId();

    if (type === "expense") {
        const existing = await prisma.expense.findUnique({ where: { id, userId } });
        if (!existing || existing.deletedAt) return { error: "Despesa não encontrada" };

        const updateData: Record<string, unknown> = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.nature !== undefined) updateData.nature = data.nature;
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.date !== undefined) {
            const d = new Date(data.date);
            updateData.dueDate = d;
            updateData.competencyDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        }

        // Handle amount change (if expense is paid, adjust account balance)
        if (data.amount !== undefined && data.amount !== existing.amount) {
            const diff = data.amount - existing.amount;
            await prisma.$transaction(async (tx) => {
                await tx.expense.update({
                    where: { id, userId },
                    data: {
                        ...updateData,
                        amount: data.amount,
                        paidAmount: existing.status === "paid" ? data.amount : existing.paidAmount,
                    }
                });
                if (existing.status === "paid" && existing.accountId) {
                    await tx.account.update({
                        where: { id: existing.accountId },
                        data: { currentBalance: { decrement: diff } }
                    });
                }
            });
        } else {
            await prisma.expense.update({
                where: { id, userId },
                data: updateData
            });
        }
    } else {
        const existing = await prisma.income.findUnique({ where: { id, userId } });
        if (!existing || existing.deletedAt) return { error: "Receita não encontrada" };

        const updateData: Record<string, unknown> = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.date !== undefined) {
            if (data.date === "") {
                // User cleared the date — use far-future sentinel (2099-12-31)
                // so the income won't appear in any real month projection
                // (migration to allow true null is also deployed in parallel)
                updateData.dueDate = new Date(Date.UTC(2099, 11, 31));
            } else {
                const d = new Date(data.date);
                updateData.dueDate = d;
                updateData.competencyDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
            }
        }

        if (data.amount !== undefined && data.amount !== existing.expectedAmount) {
            const diff = data.amount - existing.expectedAmount;
            await prisma.$transaction(async (tx) => {
                await tx.income.update({
                    where: { id, userId },
                    data: {
                        ...updateData,
                        expectedAmount: data.amount,
                        receivedAmount: existing.status === "received" ? data.amount : existing.receivedAmount,
                    }
                });
                if (existing.status === "received" && existing.accountId) {
                    await tx.account.update({
                        where: { id: existing.accountId },
                        data: { currentBalance: { increment: diff } }
                    });
                }
            });
        } else {
            await prisma.income.update({
                where: { id, userId },
                data: updateData
            });
        }
    }

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

            // Reverse any amount already credited (received or partial)
            if ((doc.status === "received" || doc.status === "partial") && doc.accountId && doc.receivedAmount > 0) {
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
