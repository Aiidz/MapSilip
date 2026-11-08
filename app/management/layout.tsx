import { pushAvailable } from '../lib/backend/push/config';
import { AppShell } from "../components/AppShell";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isStaffAuthEnabled } from "../lib/backend/auth/activation";
import { requireStaffPortalAccess } from "../lib/backend/server";
import { BackendError } from "../lib/backend/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ManagementLayout(
  { children }: Readonly<{ children: ReactNode }>,
) {
  const staffAuthEnabled = isStaffAuthEnabled();
  if (!staffAuthEnabled) redirect("/login");
  let authenticatedUserId: string | undefined;
  try { authenticatedUserId = (await requireStaffPortalAccess("owner")).userId; }
  catch (error) {
    if (error instanceof BackendError && ["unauthenticated", "forbidden"].includes(error.code)) redirect("/login");
    throw error;
  }
  return <AppShell pushEnabled={pushAvailable()} authenticatedUserId={authenticatedUserId} area="management" staffAuthEnabled={staffAuthEnabled}>{children}</AppShell>;
}
