"use server";

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { encrypt } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) return { error: "Preencha todos os campos." };

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user || !user.passwordHash) {
        return { error: "Credenciais inválidas." };
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
        return { error: "Credenciais inválidas." };
    }

    const session = await encrypt({ userId: user.id, name: user.name });
    const cookieStore = await cookies();
    cookieStore.set("session", session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    redirect("/");
}

export async function registerAction(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!name || !email || !password) return { error: "Preencha todos os campos." };

    const existing = await prisma.user.findUnique({
        where: { email },
    });

    if (existing) {
        return { error: "Este email já está em uso." };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: {
            name,
            email,
            passwordHash,
            onboardingCompleted: false,
        },
    });

    // Create default account and categories for the new user
    const account = await prisma.account.create({
        data: {
            userId: user.id,
            name: "Conta Principal",
            type: "checking",
            currentBalance: 0,
        },
    });

    await prisma.expenseCategory.createMany({
        data: [
            { userId: user.id, name: "Moradia", icon: "home" },
            { userId: user.id, name: "Transporte", icon: "directions_car" },
            { userId: user.id, name: "Alimentação", icon: "restaurant" },
            { userId: user.id, name: "Assinaturas", icon: "subscriptions" },
            { userId: user.id, name: "Lazer", icon: "sports_esports" },
            { userId: user.id, name: "Educação", icon: "school" },
        ],
    });

    await prisma.incomeSource.createMany({
        data: [
            { userId: user.id, name: "Salário Principal", type: "salary" },
            { userId: user.id, name: "Dividendos / Investimentos", type: "investment" },
            { userId: user.id, name: "Comissão / Extras", type: "commission" },
        ],
    });

    const session = await encrypt({ userId: user.id, name: user.name });
    const cookieStore = await cookies();
    cookieStore.set("session", session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    redirect("/");
}

export async function logoutAction() {
    const cookieStore = await cookies();
    cookieStore.set("session", "", { expires: new Date(0) });
    redirect("/login");
}
