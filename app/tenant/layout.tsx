import { pushAvailable } from '../lib/backend/push/config';
import { AppShell } from "../components/AppShell";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isTenantAuthEnabled } from "../lib/backend/tenant-activation";
import { requireTenantAccess } from "../lib/backend/tenant";

export default async function TenantLayout(
  { children }: Readonly<{ children: ReactNode }>,
) {
  if (!isTenantAuthEnabled()) redirect("/login");
  const { identity } = await requireTenantAccess();
  return <AppShell pushEnabled={pushAvailable()} authenticatedUserId={identity.userId} area="tenant" tenantAuthEnabled>{children}</AppShell>;
}
