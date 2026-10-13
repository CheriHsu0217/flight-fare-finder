import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router";
import { Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { useDocumentTitle } from "@/hooks/use-document-title";
import type { AuthedContext } from "./RequireAuth";

export function AppPage() {
  useDocumentTitle(
    "Dashboard — Flight Price Notifier",
    "Track Taipei to Tokyo, Seoul and London fares and get an email when they hit your target.",
  );
  const { user, queryClient } = useOutletContext<AuthedContext>();
  const navigate = useNavigate();
  // ECPay sends the shopper back via /ecpay-result -> /app?purchase=success|failed.
  const [params] = useSearchParams();
  const purchase = params.get("purchase");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent shadow-[0_0_14px_oklch(0.86_0.12_195/0.6)]">
              <Plane className="h-4 w-4 text-accent-foreground" />
            </span>
            Flight Price Notifier
          </Link>
          <Button variant="outline" onClick={signOut}>
            Sign out / 登出
          </Button>
        </div>
        <div className="neon-strip animate-glow-pulse mx-auto -mb-0.5 h-0.5 w-2/3 max-w-xl" />
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-20">
        <div className="pointer-events-none absolute inset-0 bg-glow" />
        <div className="glass-panel relative animate-fade-up rounded-[2rem] border border-white/80 p-10">
          <div className="neon-strip-pink absolute top-8 bottom-8 left-0 w-1" />
          <h1 className="text-3xl font-bold text-gradient">Hi {user.email}</h1>
          <p className="mt-4 text-lg">
            選一條航線並設定目標價，票價跌到目標價以下時，我們會寄 email 通知你。
          </p>
          {purchase === "success" && (
            <p className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              付款完成，謝謝訂閱！確認付款後訂閱會顯示「已訂閱（有效）」，並寄一封確認信給你。
            </p>
          )}
          {purchase === "failed" && (
            <p className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              付款沒有成功，請再試一次或換一張卡。
            </p>
          )}
          <div className="mt-8">
            <SubscriptionPlans email={user.email ?? ""} />
          </div>
        </div>
      </main>
    </div>
  );
}
