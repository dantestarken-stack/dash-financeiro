export const dynamic = "force-dynamic";

import DashboardClient from '@/components/DashboardClient';
import { getDashboardData } from '@/actions/dashboard';

export default async function Page() {
    const dashboardData = await getDashboardData();

    return <DashboardClient data={dashboardData} />;
}
