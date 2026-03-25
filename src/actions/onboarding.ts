"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { encrypt, SESSION_TTL_MS } from "@/lib/auth";
import { cookies } from "next/headers";
import { z } from "zod";

const OnboardingSchema = z.object({
  monthlyFixedIncome: z.coerce.number().min(0),
  financialPriority: z.enum(["savings", "debt", "invest", ""]).optional(),
  savingsGoalPercentage: z.coerce.number().min(0).max(100).default(0),
});

export async function completeOnboarding(formData: FormData) {
  const userId = await requireUserId();

  const parsed = OnboardingSchema.safeParse({
    monthlyFixedIncome: formData.get("monthlyFixedIncome"),
    financialPriority: formData.get("financialPriority") || "",
    savingsGoalPercentage: formData.get("savingsGoalPercentage") || 0,
  });
  if (!parsed.success) throw new Error(parsed.error.errors[0].message);

  const { monthlyFixedIncome, financialPriority, savingsGoalPercentage } = parsed.data;

  await prisma.$transaction(async (tx) => {
    // Atualiza ou cria o perfil do usuário
    await tx.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        monthlyFixedIncome: Math.round(monthlyFixedIncome * 100),
        financialPriority: financialPriority || null,
        savingsGoalPercentage,
      },
      update: {
        monthlyFixedIncome: Math.round(monthlyFixedIncome * 100),
        financialPriority: financialPriority || null,
        savingsGoalPercentage,
      },
    });

    // Marca onboarding como concluído
    await tx.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
  });

  // Renova o token JWT com onboardingCompleted = true
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (user) {
    const newToken = await encrypt({
      userId: user.id,
      name: user.name,
      onboardingCompleted: true,
    });
    const cookieStore = await cookies();
    cookieStore.set("session", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + SESSION_TTL_MS),
    });
  }

  revalidatePath("/");
  return { success: true };
}

export async function getOnboardingStatus() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true },
  });
  return user?.onboardingCompleted ?? false;
}
