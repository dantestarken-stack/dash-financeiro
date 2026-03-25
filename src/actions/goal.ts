"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { CreateGoalSchema, UpdateGoalProgressSchema, UpdateCategoryBudgetSchema } from "@/lib/schemas";

export async function createGoal(formData: FormData) {
    const userId = await requireUserId();

    const parsed = CreateGoalSchema.safeParse({
        title: formData.get("title"),
        targetAmount: formData.get("targetAmount"),
        targetDate: formData.get("targetDate"),
        type: formData.get("type") || "savings",
        description: formData.get("description") || "",
    });
    if (!parsed.success) throw new Error(parsed.error.errors[0].message);
    const { title, targetAmount, targetDate, type, description } = parsed.data;

    const targetAmountCentavos = Math.round(targetAmount * 100);

    await prisma.goal.create({
        data: {
            userId,
            title,
            targetAmount: targetAmountCentavos,
            targetDate: new Date(targetDate),
            startDate: new Date(),
            type,
            description,
            status: "active"
        }
    });

    revalidatePath("/");
    return { success: true };
}

export async function updateGoalProgress(goalId: string, amountStr: string) {
    const userId = await requireUserId();

    const parsed = UpdateGoalProgressSchema.safeParse({ amount: amountStr });
    if (!parsed.success) throw new Error(parsed.error.errors[0].message);

    const amountCentavos = Math.round(parsed.data.amount * 100);

    await prisma.goal.update({
        where: { id: goalId, userId },
        data: { currentAmount: { increment: amountCentavos } }
    });

    revalidatePath("/");
    return { success: true };
}

export async function deleteGoal(id: string) {
    const userId = await requireUserId();
    // Soft delete — mantém histórico para auditorias e desfazer acidental
    await prisma.goal.update({
        where: { id, userId },
        data: { deletedAt: new Date() }
    });
    revalidatePath("/");
    return { success: true };
}

export async function updateCategoryBudget(categoryId: string, budgetStr: string) {
    const userId = await requireUserId();

    const parsed = UpdateCategoryBudgetSchema.safeParse({ budgetLimit: budgetStr });
    if (!parsed.success) throw new Error(parsed.error.errors[0].message);

    const budgetLimit = Math.round(parsed.data.budgetLimit * 100);

    await prisma.expenseCategory.update({
        where: { id: categoryId, userId },
        data: { budgetLimit }
    });

    revalidatePath("/");
    return { success: true };
}
