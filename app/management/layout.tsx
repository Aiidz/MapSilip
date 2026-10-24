import { AppShell } from "../components/AppShell";
import type { ReactNode } from "react";

export default function ManagementLayout(
  { children }: Readonly<{ children: ReactNode }>,
) {
  return <AppShell area="management">{children}</AppShell>;
}
