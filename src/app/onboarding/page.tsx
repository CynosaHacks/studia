import { getProfile } from "@/lib/db";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/pages/Onboarding";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const profile = getProfile();
  if (profile?.onboarded) redirect("/");
  return <OnboardingWizard />;
}
