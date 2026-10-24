import type { ReactNode } from "react";

export function FeedbackMessage(
  { tone, children }: {
    tone: "info" | "success" | "warning" | "error";
    children: ReactNode;
  },
) {
  const isError = tone === "error";
  return (
    <div
      className={`feedback-message feedback-message--${tone}`}
      role={isError ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
