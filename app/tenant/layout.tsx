import { AppShell } from "../components/AppShell";
import type { ReactNode } from "react";

export default function TenantLayout(
  { children }: Readonly<{ children: ReactNode }>,
) {
  return <AppShell area="tenant">{children}</AppShell>;
}
