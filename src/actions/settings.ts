"use server";

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requireUserId } from "@/lib/session";
import { encrypt, SESSION_TTL_MS } from "@/lib/auth";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const UpdateProfileSchema = z.object({
    name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(80),
});

const UpdateFinancialSchema = z.object({
    monthlyFixedIncome: z.string().transform(v => Math.round(parseFloat(v.replace(/\./g, "").replace(",", ".") || "0") * 100)),
    savingsGoalPercentage: z.string().transform(v => parseFloat(v || "0")),
    financialPriority: z.string().optional(),
});

const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Senha atual é obrigatória"),
    newPassword: z.string().min(8, "Nova senha deve ter ao menos 8 caracteres"),
});

export async function updateProfile(formData: FormData) {
    const userId = await requireUserId();

    const parsed = UpdateProfileSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const user = await prisma.user.update({
        where: { id: userId },
        data: { name: parsed.data.name },
    });

    // Refresh session with new name
    const cookieStore = await cookies();
    const session = await encrypt({ userId: user.id, name: user.name, onboardingCompleted: user.onboardingCompleted });
    cookieStore.set("session", session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(Date.now() + SESSION_TTL_MS),
    });

    revalidatePath("/");
    return { success: true };
}

export async function updateFinancialProfile(formData: FormData) {
    const userId = await requireUserId();

    const parsed = UpdateFinancialSchema.safeParse({
        monthlyFixedIncome: formData.get("monthlyFixedIncome"),
        savingsGoalPercentage: formData.get("savingsGoalPercentage"),
        financialPriority: formData.get("financialPriority"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    await prisma.userProfile.upsert({
        where: { userId },
        update: {
            monthlyFixedIncome: parsed.data.monthlyFixedIncome,
            savingsGoalPercentage: parsed.data.savingsGoalPercentage,
            financialPriority: parsed.data.financialPriority || null,
        },
        create: {
            userId,
            monthlyFixedIncome: parsed.data.monthlyFixedIncome,
            savingsGoalPercentage: parsed.data.savingsGoalPercentage,
            financialPriority: parsed.data.financialPriority || null,
        },
    });

    revalidatePath("/");
    return { success: true };
}

export async function changePassword(formData: FormData) {
    const userId = await requireUserId();

    const parsed = ChangePasswordSchema.safeParse({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) return { error: "Usuário não encontrado." };

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) return { error: "Senha atual incorreta." };

    const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    return { success: true };
}

export async function getProfileData() {
    const userId = await requireUserId();

    const [user, profile] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
        prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    return { user, profile };
}
