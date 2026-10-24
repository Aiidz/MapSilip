import { AppShell } from "../components/AppShell";
import type { ReactNode } from "react";

export default function CaretakerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell area="caretaker">{children}</AppShell>;
}
