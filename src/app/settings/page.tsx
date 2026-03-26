export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth";
import { getProfileData } from "@/actions/settings";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) redirect("/login");
    const session = await decrypt(sessionCookie);
    if (!session?.userId) redirect("/login");

    const { user, profile } = await getProfileData();

    return <SettingsClient user={user} profile={profile} />;
}
