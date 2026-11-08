import { resumeSignedInPortal } from "./lib/backend/resume-session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  await resumeSignedInPortal();
  redirect("/login");
}
