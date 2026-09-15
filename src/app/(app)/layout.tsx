import { getProfile, getSetting } from "@/lib/db";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = getProfile();
  if (!profile?.onboarded) redirect("/onboarding");
  const demoActive = getSetting("demo.active") === "1";
  return <Shell demoActive={demoActive}>{children}</Shell>;
}
