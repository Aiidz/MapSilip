import { WelcomeOnboarding } from "../components/WelcomeOnboarding";
import { resumeSignedInPortal } from "../lib/backend/resume-session";
import { AuthPreview } from "../components/AuthPreview";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await resumeSignedInPortal((await searchParams).notice);
  return <><AuthPreview refineLogin /><WelcomeOnboarding /></>;
}
