"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createAsset(formData: FormData) {
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const amountStr = formData.get("amount") as string;
    const notes = formData.get("notes") as string || "";

    // Parse amount to cents
    let cleanedString = amountStr;
    if (amountStr.includes(",")) {
        cleanedString = amountStr.replace(/\./g, "").replace(",", ".");
    }
    const amountCentavos = Math.round(parseFloat(cleanedString) * 100);

    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Usuário não encontrado");

    await prisma.asset.create({
        data: {
            userId: user.id,
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

    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Usuário não encontrado");

    await prisma.liability.create({
        data: {
            userId: user.id,
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
    await prisma.asset.delete({ where: { id } });
    revalidatePath("/");
    return { success: true };
}

export async function deleteLiability(id: string) {
    await prisma.liability.delete({ where: { id } });
    revalidatePath("/");
    return { success: true };
}
