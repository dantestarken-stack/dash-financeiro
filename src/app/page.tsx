export const dynamic = "force-dynamic";

import DashboardClient from '@/components/DashboardClient';
import { getDashboardData } from '@/actions/dashboard';

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string }>;
}) {
    const params = await searchParams;
    const month = params.month ? parseInt(params.month) : new Date().getMonth();
    const year = params.year ? parseInt(params.year) : new Date().getFullYear();

    const dashboardData = await getDashboardData(year, month);

    return <DashboardClient data={dashboardData} currentMonth={month} currentYear={year} />;
}
