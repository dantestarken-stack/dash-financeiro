"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { CreateAssetSchema, CreateLiabilitySchema } from "@/lib/schemas";

export async function createAsset(formData: FormData) {
    const userId = await requireUserId();

    const parsed = CreateAssetSchema.safeParse({
        name: formData.get("name"),
        type: formData.get("type"),
        amount: formData.get("amount"),
        notes: formData.get("notes") || "",
    });
    if (!parsed.success) throw new Error(parsed.error.errors[0].message);
    const { name, type, amount, notes } = parsed.data;

    await prisma.asset.create({
        data: {
            userId,
            name,
            type,
            amount: Math.round(amount * 100),
            valuationDate: new Date(),
            notes,
        }
    });

    revalidatePath("/");
    return { success: true };
}

export async function createLiability(formData: FormData) {
    const userId = await requireUserId();

    const parsed = CreateLiabilitySchema.safeParse({
        name: formData.get("name"),
        type: formData.get("type"),
        totalAmount: formData.get("totalAmount"),
        outstandingAmount: formData.get("outstandingAmount"),
        monthlyPayment: formData.get("monthlyPayment"),
        notes: formData.get("notes") || "",
    });
    if (!parsed.success) throw new Error(parsed.error.errors[0].message);
    const { name, type, totalAmount, outstandingAmount, monthlyPayment, notes } = parsed.data;

    await prisma.liability.create({
        data: {
            userId,
            name,
            type,
            totalAmount: Math.round(totalAmount * 100),
            outstandingAmount: Math.round(outstandingAmount * 100),
            monthlyPayment: Math.round(monthlyPayment * 100),
            notes,
        }
    });

    revalidatePath("/");
    return { success: true };
}

export async function deleteAsset(id: string) {
    const userId = await requireUserId();
    await prisma.asset.update({
        where: { id, userId },
        data: { deletedAt: new Date() }
    });
    revalidatePath("/");
    return { success: true };
}

export async function deleteLiability(id: string) {
    const userId = await requireUserId();
    await prisma.liability.update({
        where: { id, userId },
        data: { deletedAt: new Date() }
    });
    revalidatePath("/");
    return { success: true };
}
