"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createGoal(formData: FormData) {
    const title = formData.get("title") as string;
    const amountStr = formData.get("targetAmount") as string;
    const targetDateStr = formData.get("targetDate") as string;
    const type = formData.get("type") as string || "savings"; // savings, debt, purchase
    const description = formData.get("description") as string || "";

    const cleaned = amountStr.replace(/\./g, "").replace(",", ".");
    const targetAmount = Math.round(parseFloat(cleaned) * 100);

    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Usuário não encontrado");

    await prisma.goal.create({
        data: {
            userId: user.id,
            title,
            targetAmount,
            targetDate: new Date(targetDateStr),
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
    const cleaned = amountStr.replace(/\./g, "").replace(",", ".");
    const amountCentavos = Math.round(parseFloat(cleaned) * 100);

    await prisma.goal.update({
        where: { id: goalId },
        data: { currentAmount: { increment: amountCentavos } }
    });

    revalidatePath("/");
    return { success: true };
}

export async function deleteGoal(id: string) {
    await prisma.goal.delete({ where: { id } });
    revalidatePath("/");
    return { success: true };
}

export async function updateCategoryBudget(categoryId: string, budgetStr: string) {
    const cleaned = budgetStr.replace(/\./g, "").replace(",", ".");
    const budgetLimit = Math.round(parseFloat(cleaned) * 100);

    await prisma.expenseCategory.update({
        where: { id: categoryId },
        data: { budgetLimit }
    });

    revalidatePath("/");
    return { success: true };
}
