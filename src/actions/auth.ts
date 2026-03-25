"use server";

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { encrypt, SESSION_TTL_MS } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginSchema, RegisterSchema } from "@/lib/schemas";

export async function loginAction(formData: FormData) {
    const parsed = LoginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) {
        return { error: parsed.error.errors[0].message };
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
        return { error: "Credenciais inválidas." };
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
        return { error: "Credenciais inválidas." };
    }

    const session = await encrypt({
        userId: user.id,
        name: user.name,
        onboardingCompleted: user.onboardingCompleted,
    });
    const cookieStore = await cookies();
    cookieStore.set("session", session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(Date.now() + SESSION_TTL_MS),
    });

    redirect("/");
}

export async function registerAction(formData: FormData) {
    const parsed = RegisterSchema.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) {
        return { error: parsed.error.errors[0].message };
    }
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
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

    const categories = [
        { name: "Moradia", icon: "home", subs: ["aluguel", "financiamento imobiliário", "condomínio", "IPTU", "energia elétrica", "água", "gás", "internet residencial", "manutenção da casa", "consertos", "faxina", "móveis", "eletrodomésticos", "decoração"] },
        { name: "Alimentação", icon: "restaurant", subs: ["supermercado", "feira", "açougue", "padaria", "delivery", "restaurantes", "lanches", "cafeteria", "marmita", "snacks", "água", "suplementos alimentares"] },
        { name: "Transporte", icon: "directions_car", subs: ["combustível", "estacionamento", "pedágio", "manutenção do carro", "troca de óleo", "lavagem", "seguro do carro", "IPVA", "licenciamento", "multas", "transporte por app", "táxi", "ônibus", "metrô", "passagem", "aluguel de carro"] },
        { name: "Saúde", icon: "medical_services", subs: ["plano de saúde", "consultas médicas", "exames", "medicamentos", "farmácia", "dentista", "psicólogo", "fisioterapia", "terapia", "academia", "pilates", "suplementos", "óculos", "procedimentos médicos"] },
        { name: "Educação", icon: "school", subs: ["faculdade", "curso", "pós-graduação", "escola", "mensalidade", "livros", "materiais", "plataformas de ensino", "aulas particulares", "idiomas", "certificações", "treinamentos"] },
        { name: "Lazer e entretenimento", icon: "sports_esports", subs: ["cinema", "shows", "viagens de lazer", "bares", "festas", "baladas", "streaming", "jogos", "hobbies", "passeios", "parques", "clube", "eventos", "turismo"] },
        { name: "Assinaturas e serviços digitais", icon: "subscriptions", subs: ["Netflix", "Spotify", "YouTube Premium", "iCloud", "Google One", "ChatGPT", "apps de produtividade", "antivírus", "domínio", "hospedagem", "softwares", "armazenamento em nuvem", "ferramentas de trabalho"] },
        { name: "Compras pessoais", icon: "shopping_bag", subs: ["roupas", "calçados", "acessórios", "perfume", "cosméticos", "cuidados pessoais", "barbearia", "salão de beleza", "maquiagem", "mochila", "itens pessoais", "eletrônicos", "celular", "notebook"] },
    ];

    for (const cat of categories) {
        const createdCat = await prisma.expenseCategory.create({
            data: { userId: user.id, name: cat.name, icon: cat.icon }
        });
        await prisma.expenseSubcategory.createMany({
            data: cat.subs.map(s => ({ userId: user.id, categoryId: createdCat.id, name: s }))
        });
    }

    await prisma.incomeSource.createMany({
        data: [
            { userId: user.id, name: "Salário Principal", type: "salary" },
            { userId: user.id, name: "Dividendos / Investimentos", type: "investment" },
            { userId: user.id, name: "Comissão / Extras", type: "commission" },
        ],
    });

    const session = await encrypt({
        userId: user.id,
        name: user.name,
        onboardingCompleted: false, // novo usuário sempre começa sem onboarding
    });
    const cookieStore = await cookies();
    cookieStore.set("session", session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(Date.now() + SESSION_TTL_MS),
    });

    redirect("/");
}

export async function logoutAction() {
    const cookieStore = await cookies();
    cookieStore.set("session", "", { expires: new Date(0) });
    redirect("/login");
}
