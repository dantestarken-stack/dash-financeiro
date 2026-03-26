import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

if (!process.env.JWT_SECRET) {
    throw new Error(
        "[auth] A variável de ambiente JWT_SECRET não está definida. " +
        "Defina um segredo forte no seu .env antes de rodar a aplicação."
    );
}

const key = new TextEncoder().encode(process.env.JWT_SECRET);

/** Tempo de vida de uma sessão: 30 dias */
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface SessionPayload {
    userId: string;
    onboardingCompleted?: boolean;
    iat?: number;
    exp?: number;
    [key: string]: unknown;
}

export async function encrypt(payload: object) {
    return await new SignJWT(payload as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_DAYS}d`)
        .sign(key);
}

export { SESSION_TTL_MS };

export async function decrypt(input: string): Promise<SessionPayload> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ["HS256"],
    });
    return payload as SessionPayload;
}

export async function getSession() {
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;
    if (!session) return null;
    return await decrypt(session);
}
