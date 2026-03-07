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

export async function createAsset(formData: FormData) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const amountStr = formData.get("amount") as string;
    const notes = formData.get("notes") as string || "";

    let cleanedString = amountStr;
    if (amountStr.includes(",")) {
        cleanedString = amountStr.replace(/\./g, "").replace(",", ".");
    }
    const amountCentavos = Math.round(parseFloat(cleanedString) * 100);

    await prisma.asset.create({
        data: {
            userId,
            name,
            type,
            amount: amountCentavos,
            valuationDate: new Date(),
            notes,
        }
    });

    revalidatePath("/");
    return { success: true };
}

export async function createLiability(formData: FormData) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");

    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const totalAmountStr = formData.get("totalAmount") as string;
    const outstandingAmountStr = formData.get("outstandingAmount") as string;
    const monthlyPaymentStr = formData.get("monthlyPayment") as string;
    const notes = formData.get("notes") as string || "";

    const parseCentavos = (str: string) => {
        let cleaned = str;
        if (str.includes(",")) {
            cleaned = str.replace(/\./g, "").replace(",", ".");
        }
        return Math.round(parseFloat(cleaned) * 100);
    };

    const totalAmount = parseCentavos(totalAmountStr);
    const outstandingAmount = parseCentavos(outstandingAmountStr);
    const monthlyPayment = parseCentavos(monthlyPaymentStr);

    await prisma.liability.create({
        data: {
            userId,
            name,
            type,
            totalAmount,
            outstandingAmount,
            monthlyPayment,
            notes,
        }
    });

    revalidatePath("/");
    return { success: true };
}

export async function deleteAsset(id: string) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");
    await prisma.asset.delete({ where: { id, userId } });
    revalidatePath("/");
    return { success: true };
}

export async function deleteLiability(id: string) {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");
    await prisma.liability.delete({ where: { id, userId } });
    revalidatePath("/");
    return { success: true };
}
