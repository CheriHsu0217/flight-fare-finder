import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PlanName = "tokyo" | "seoul";

type Subscription = {
  route: string;
  plan_name: PlanName;
  target_price: number;
  currency: string;
  updated_at: string;
};

const PLANS: { name: PlanName; label: string; route: string; hint: number }[] = [
  { name: "tokyo", label: "台北 ✈ 東京", route: "TPE-TYO", hint: 9325 },
  { name: "seoul", label: "台北 ✈ 首爾", route: "TPE-SEL", hint: 5989 },
];

const ntd = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

// Edge Function `subscriptions`: GET lists the signed-in user's rows, POST saves one.
// The function reads the email from the session token, so the body never carries it.
async function listSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase.functions.invoke("subscriptions", { method: "GET" });
  if (error) throw error;
  return data.subscriptions ?? [];
}

async function saveSubscription(input: { plan_name: PlanName; target_price: number }) {
  const { data, error } = await supabase.functions.invoke("subscriptions", {
    method: "POST",
    body: input,
  });
  if (error) throw error;
  return data;
}

function PlanCard({
  plan,
  current,
}: {
  plan: (typeof PLANS)[number];
  current: Subscription | undefined;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(current ? String(current.target_price) : "");
  const mutation = useMutation({
    mutationFn: saveSubscription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
  });

  const price = Number(target);
  const valid = Number.isFinite(price) && price > 0;

  return (
    <div className="glass-panel relative rounded-[1.5rem] border border-white/80 p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Plane className="h-5 w-5" />
          {plan.label}
        </h2>
        {current && <Badge>已訂閱</Badge>}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {current
          ? `目前目標價 ${ntd(current.target_price)}，低於這個價格就寄信通知你。`
          : `最近最低價約 ${ntd(plan.hint)}，設一個你願意出的價格。`}
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) mutation.mutate({ plan_name: plan.name, target_price: price });
        }}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="目標價（TWD）"
          aria-label={`${plan.label} 目標價（TWD）`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <Button type="submit" disabled={!valid || mutation.isPending}>
          {mutation.isPending ? "儲存中…" : current ? "更新目標價" : "開始追蹤"}
        </Button>
      </form>
      {mutation.isError && <p className="mt-2 text-sm text-destructive">儲存失敗，請稍後再試。</p>}
    </div>
  );
}

export function SubscriptionPlans() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listSubscriptions,
  });

  if (isLoading) return <p className="text-muted-foreground">載入訂閱中…</p>;
  if (isError) return <p className="text-destructive">讀取訂閱失敗，請重新整理。</p>;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {PLANS.map((plan) => (
        <PlanCard key={plan.name} plan={plan} current={data?.find((s) => s.route === plan.route)} />
      ))}
    </div>
  );
}
