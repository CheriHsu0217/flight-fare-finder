import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, Plane, Radar, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flight Price Notifier — 機票降價通知" },
      { name: "description", content: "Set a route and a target price — we email you when the fare drops." },
      { property: "og:title", content: "Flight Price Notifier — 機票降價通知" },
      { property: "og:description", content: "Set a route and a target price — we email you when the fare drops." },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Radar, title: "盯緊熱門航線 (Always-on route watching)", body: "持續監控台北出發的熱門航線（東京、首爾），自動抓最低票價。" },
  { icon: Bell, title: "達標自動通知 (Target-price email alerts)", body: "低於你設定的目標價，就寄 email 提醒你，附上立即訂購連結。" },
  { icon: XCircle, title: "隨時取消 (Cancel anytime)", body: "月訂閱制，不想用隨時停，沒有綁約。" },
];

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("is-visible"); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="reveal h-full" style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Plane className="h-5 w-5 text-primary" /> Flight Price Notifier
          </Link>
          {signedIn ? (
            <Button asChild><Link to="/app">Dashboard</Link></Button>
          ) : (
            <Button asChild className="shadow-glow"><Link to="/signin">Sign in / 登入</Link></Button>
          )}
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-glow" />
          <div className="relative mx-auto max-w-4xl px-4 py-28 text-center sm:py-36">
            <p className="animate-fade-up text-sm font-medium tracking-widest text-primary uppercase">機票降價通知</p>
            <h1 className="mt-4 animate-fade-up text-5xl font-bold tracking-tight text-gradient sm:text-7xl">
              Flight Price Notifier
            </h1>
            <p className="mt-6 animate-fade-up text-xl sm:text-2xl" style={{ animationDelay: "120ms" }}>
              設定航線與目標價，機票降價就通知你
            </p>
            <p className="mt-3 animate-fade-up text-muted-foreground" style={{ animationDelay: "200ms" }}>
              Set a route and a target price — we email you when the fare drops.
            </p>
            <div className="mt-10 animate-fade-up" style={{ animationDelay: "280ms" }}>
              <Button asChild size="lg" className="shadow-glow">
                <Link to="/signup">開始使用 Get started</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-28">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <div className="h-full rounded-2xl border bg-card p-6 transition-colors hover:border-primary/50">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-muted-foreground">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">© 2026 Flight Price Notifier</footer>
    </div>
  );
}
