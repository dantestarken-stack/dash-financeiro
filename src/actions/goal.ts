"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    const session = await decrypt(token);
    return session.userId;
}

export async function createGoal(formData: FormData) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    const title = formData.get("title") as string;
    const amountStr = formData.get("targetAmount") as string;
    const targetDateStr = formData.get("targetDate") as string;
    const type = formData.get("type") as string || "savings";
    const description = formData.get("description") as string || "";

    const cleaned = amountStr.replace(/\./g, "").replace(",", ".");
    const targetAmount = Math.round(parseFloat(cleaned) * 100);

    await prisma.goal.create({
        data: {
            userId,
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
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    const cleaned = amountStr.replace(/\./g, "").replace(",", ".");
    const amountCentavos = Math.round(parseFloat(cleaned) * 100);

    await prisma.goal.update({
        where: { id: goalId, userId },
        data: { currentAmount: { increment: amountCentavos } }
    });

    revalidatePath("/");
    return { success: true };
}

export async function deleteGoal(id: string) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");
    await prisma.goal.delete({ where: { id, userId } });
    revalidatePath("/");
    return { success: true };
}

export async function updateCategoryBudget(categoryId: string, budgetStr: string) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    const cleaned = budgetStr.replace(/\./g, "").replace(",", ".");
    const budgetLimit = Math.round(parseFloat(cleaned) * 100);

    await prisma.expenseCategory.update({
        where: { id: categoryId, userId },
        data: { budgetLimit }
    });

    revalidatePath("/");
    return { success: true };
}
