import { AuthForm } from "@/components/AuthForm";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function SignIn() {
  useDocumentTitle(
    "Sign in — Flight Price Notifier",
    "Sign in to manage your flight price alerts.",
  );
  return <AuthForm mode="signin" />;
}

export function SignUp() {
  useDocumentTitle(
    "Sign up — Flight Price Notifier",
    "Create an account and get emailed when fares drop.",
  );
  return <AuthForm mode="signup" />;
}
