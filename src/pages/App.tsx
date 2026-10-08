import { Link, useNavigate, useOutletContext } from "react-router";
import { Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import type { AuthedContext } from "./RequireAuth";

export function AppPage() {
  useDocumentTitle("Dashboard — Flight Price Notifier", "Your flight route tracking dashboard.");
  const { user, queryClient } = useOutletContext<AuthedContext>();
  const navigate = useNavigate();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Plane className="h-5 w-5 text-primary" /> Flight Price Notifier
          </Link>
          <Button variant="outline" onClick={signOut}>
            Sign out / 登出
          </Button>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-20">
        <div className="pointer-events-none absolute inset-0 bg-glow" />
        <div className="relative animate-fade-up rounded-2xl border bg-card p-10">
          <h1 className="text-3xl font-semibold">Hi {user.email}</h1>
          <p className="mt-4 text-lg">
            你的航線追蹤儀表板即將上線 — 下一個里程碑會加上訂閱航線的功能。
          </p>
          <p className="mt-2 text-muted-foreground">
            Your dashboard is coming soon. Route-subscription will be added in the next milestone.
          </p>
        </div>
      </main>
    </div>
  );
}
