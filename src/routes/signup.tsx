import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — Flight Price Notifier" },
      { name: "description", content: "Create an account and get emailed when fares drop." },
      { property: "og:title", content: "Sign up — Flight Price Notifier" },
      { property: "og:description", content: "Create an account and get emailed when fares drop." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ next: typeof s.next === "string" ? s.next : undefined }),
  component: () => <AuthForm mode="signup" />,
});
