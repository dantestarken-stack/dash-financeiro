/**
 * Schemas de validação Zod para todas as Server Actions.
 * Centralizar aqui garante consistência e facilita testes unitários.
 */
import { z } from "zod";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Transforma string de valor monetário BR (ex: "1.234,56") em número float */
const monetaryString = z
  .string()
  .min(1, "Valor obrigatório")
  .transform((v) => {
    const cleaned = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || parsed < 0) throw new Error("Valor inválido");
    return parsed;
  });

const dateString = z
  .string()
  .min(1, "Data obrigatória")
  .refine((v) => !isNaN(Date.parse(v)), { message: "Data inválida" });

const uuidString = z.string().uuid("ID inválido");

// ─── Auth ────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

export const RegisterSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(80),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

// ─── Transaction ─────────────────────────────────────────────────────────────

export const TransactionSchema = z.object({
  type: z.enum(["income", "expense"], { message: "Tipo inválido" }),
  title: z.string().min(1, "Título obrigatório").max(120),
  amount: monetaryString,
  accountId: uuidString,
  dueDate: dateString,
  nature: z.enum(["essential", "important", "superfluous"]).default("essential"),
  notes: z.string().max(500).optional(),
  isPaid: z.boolean().default(false),
  isRecurring: z.boolean().default(false),
  // Campos de receita
  incomeSourceId: z.string().optional(),
  isCommissionReceipt: z.boolean().default(false),
  abatement: z.string().optional(),
  // Campos de despesa
  categoryId: z.string().optional(),
  isInstallment: z.boolean().default(false),
  installmentsCount: z.coerce.number().int().min(1).max(120).default(1),
});

// ─── Goal ────────────────────────────────────────────────────────────────────

export const CreateGoalSchema = z.object({
  title: z.string().min(1, "Título obrigatório").max(100),
  targetAmount: monetaryString,
  targetDate: dateString,
  type: z.string().default("savings"),
  description: z.string().max(300).optional(),
});

export const UpdateGoalProgressSchema = z.object({
  amount: monetaryString,
});

export const UpdateCategoryBudgetSchema = z.object({
  budgetLimit: monetaryString,
});

// ─── Patrimony ───────────────────────────────────────────────────────────────

export const CreateAssetSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1),
  amount: monetaryString,
  notes: z.string().max(300).optional(),
});

export const CreateLiabilitySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1),
  totalAmount: monetaryString,
  outstandingAmount: monetaryString,
  monthlyPayment: monetaryString,
  notes: z.string().max(300).optional(),
});
