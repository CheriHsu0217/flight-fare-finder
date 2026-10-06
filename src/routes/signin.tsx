import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — Flight Price Notifier" },
      { name: "description", content: "Sign in to manage your flight price alerts." },
      { property: "og:title", content: "Sign in — Flight Price Notifier" },
      { property: "og:description", content: "Sign in to manage your flight price alerts." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => (typeof s["next"] === "string" ? { next: s["next"] } : {}),
  component: () => <AuthForm mode="signin" />,
});
