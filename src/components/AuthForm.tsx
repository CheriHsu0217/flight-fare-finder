import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isSignUp = mode === "signup";
  const rawNext = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { data, error } = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${next ?? "/app"}` },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    if (!data.session) return setInfo("請到信箱確認後再登入 / Check your email to confirm.");
    if (next) { window.location.href = next; return; }
    navigate("/app", { replace: true });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 bg-glow" />
      <div className="glass-panel relative w-full max-w-sm animate-fade-up overflow-hidden rounded-[2rem] border border-white/80 p-8">
        <div className="neon-strip absolute inset-x-10 top-0 h-0.5" />
        <Link to="/" className="mb-6 flex items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent shadow-[0_0_14px_oklch(0.86_0.12_195/0.6)]">
            <Plane className="h-4 w-4 text-accent-foreground" />
          </span>
          Flight Price Notifier
        </Link>
        <h1 className="text-2xl font-bold">{isSignUp ? "建立帳號 Sign up" : "登入 Sign in"}</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
          <Button type="submit" className="w-full shadow-glow" disabled={loading}>
            {loading ? "..." : isSignUp ? "Sign up / 註冊" : "Sign in / 登入"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>已有帳號？ <Link to="/signin" className="text-primary hover:underline">Sign in</Link></>
          ) : (
            <>還沒有帳號？ <Link to="/signup" className="text-primary hover:underline">Sign up</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
