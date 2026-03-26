export const dynamic = "force-dynamic";

import DashboardClient from '@/components/DashboardClient';
import { getDashboardData } from '@/actions/dashboard';
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string }>;
}) {
    const params = await searchParams;
    const month = params.month ? parseInt(params.month as string) : new Date().getMonth();
    const year = params.year ? parseInt(params.year as string) : new Date().getFullYear();

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) redirect("/login");
    const session = await decrypt(sessionCookie);

    const dashboardData = await getDashboardData(year, month, session.userId);

    return <DashboardClient data={dashboardData} currentMonth={month} currentYear={year} />;
}
