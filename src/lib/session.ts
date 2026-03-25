/**
 * Utilitários de sessão para Server Actions.
 * Centraliza a leitura do userId a partir do cookie JWT,
 * evitando duplicação em cada action file.
 */
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth";

/**
 * Retorna o userId da sessão atual, ou null se não autenticado.
 * Uso: const userId = await getUserId();
 */
export async function getUserId(): Promise<string | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;

    try {
        const session = await decrypt(token);
        const userId = session.userId;
        if (typeof userId !== "string" || !userId) return null;
        return userId;
    } catch {
        // Token inválido ou expirado
        return null;
    }
}

/**
 * Igual a getUserId(), mas lança um erro se não autenticado.
 * Simplifica guards em actions que sempre exigem login.
 */
export async function requireUserId(): Promise<string> {
    const userId = await getUserId();
    if (!userId) throw new Error("Não autorizado");
    return userId;
}
