"use server";

import prisma from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CreateCardSchema = z.object({
    name: z.string().min(1, "Nome do cartão é obrigatório"),
    brand: z.string().min(1, "Bandeira é obrigatória"),
    limitAmount: z.string().transform(v => Math.round(parseFloat(v.replace(/\./g, "").replace(",", ".") || "0") * 100)),
    closingDay: z.string().transform(v => parseInt(v || "1")),
    dueDay: z.string().transform(v => parseInt(v || "10")),
    accountId: z.string().optional(),
});

export async function createCard(formData: FormData) {
    const userId = await requireUserId();

    const parsed = CreateCardSchema.safeParse({
        name: formData.get("name"),
        brand: formData.get("brand"),
        limitAmount: formData.get("limitAmount"),
        closingDay: formData.get("closingDay"),
        dueDay: formData.get("dueDay"),
        accountId: formData.get("accountId") || undefined,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    await prisma.card.create({
        data: {
            userId,
            name: parsed.data.name,
            brand: parsed.data.brand,
            limitAmount: parsed.data.limitAmount,
            closingDay: parsed.data.closingDay,
            dueDay: parsed.data.dueDay,
            accountId: parsed.data.accountId || null,
            isActive: true,
        },
    });

    revalidatePath("/");
    return { success: true };
}

export async function deleteCard(id: string) {
    const userId = await requireUserId();
    await prisma.card.update({
        where: { id, userId },
        data: { isActive: false },
    });
    revalidatePath("/");
    return { success: true };
}

export async function getCards() {
    const userId = await requireUserId();
    return prisma.card.findMany({
        where: { userId, isActive: true },
        include: { account: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
    });
}
