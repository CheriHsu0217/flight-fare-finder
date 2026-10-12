import { Link } from "react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, Plane, Radar, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CabinWindow } from "@/components/CabinWindow";
import { useDocumentTitle } from "@/hooks/use-document-title";

const features = [
  {
    icon: Radar,
    title: "盯緊熱門航線 (Always-on route watching)",
    body: "持續監控台北出發的熱門航線（東京、首爾），自動抓最低票價。",
  },
  {
    icon: Bell,
    title: "達標自動通知 (Target-price email alerts)",
    body: "低於你設定的目標價，就寄 email 提醒你，附上立即訂購連結。",
  },
  { icon: XCircle, title: "隨時取消 (Cancel anytime)", body: "月訂閱制，不想用隨時停，沒有綁約。" },
];

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="reveal h-full" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function Index() {
  useDocumentTitle(
    "Flight Price Notifier — 機票降價通知",
    "Set a route and a target price — we email you when the fare drops.",
  );
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent shadow-[0_0_14px_oklch(0.86_0.12_195/0.6)]">
              <Plane className="h-4 w-4 text-accent-foreground" />
            </span>
            Flight Price Notifier
          </Link>
          {signedIn ? (
            <Link to="/app" className={buttonVariants()}>
              Dashboard
            </Link>
          ) : (
            <Link to="/signin" className={cn(buttonVariants(), "shadow-glow")}>
              Sign in / 登入
            </Link>
          )}
        </div>
        <div className="neon-strip animate-glow-pulse mx-auto -mb-0.5 h-0.5 w-2/3 max-w-xl" />
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-glow" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:py-28 lg:grid-cols-[1.05fr_1fr]">
            <div className="text-center lg:text-left">
              <p className="inline-flex animate-fade-up items-center gap-2 rounded-full border bg-card/70 px-4 py-1.5 text-sm font-semibold tracking-widest text-primary uppercase backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-[var(--neon-aqua)] shadow-[0_0_8px_var(--neon-aqua)]" />
                機票降價通知
              </p>
              <h1 className="mt-5 animate-fade-up text-5xl font-bold tracking-tight text-gradient sm:text-7xl">
                Flight Price Notifier
              </h1>
              <p
                className="mt-6 animate-fade-up text-xl font-medium sm:text-2xl"
                style={{ animationDelay: "120ms" }}
              >
                設定航線與目標價，機票降價就通知你
              </p>
              <p
                className="mt-3 animate-fade-up text-muted-foreground"
                style={{ animationDelay: "200ms" }}
              >
                Set a route and a target price — we email you when the fare drops.
              </p>
              <div className="mt-10 animate-fade-up" style={{ animationDelay: "280ms" }}>
                <Link to="/signup" className={cn(buttonVariants({ size: "lg" }), "shadow-glow")}>
                  開始使用 Get started
                </Link>
              </div>
            </div>
            <CabinWindow className="mx-auto w-full max-w-lg animate-fade-up" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-28">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <div className="glass-panel group h-full rounded-3xl border border-white/80 p-7 transition-transform hover:-translate-y-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent shadow-[0_0_18px_oklch(0.86_0.12_195/0.45)] transition-shadow group-hover:shadow-[0_0_26px_oklch(0.86_0.12_195/0.7)]">
                    <f.icon className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
                  <p className="mt-2 text-muted-foreground">{f.body}</p>
                  <div className="neon-strip-pink mt-6 h-1 w-10 opacity-70 transition-all group-hover:w-20" />
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t bg-card/50 py-8 text-center text-sm text-muted-foreground backdrop-blur">
        © 2026 Flight Price Notifier
      </footer>
    </div>
  );
}
