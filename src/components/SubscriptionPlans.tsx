import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PlanName = "tokyo" | "seoul" | "london";

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
  { name: "london", label: "台北 ✈ 倫敦", route: "TPE-LON", hint: 20743 },
];

const ntd = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

// flight-api (API Gateway + Lambda in ap-southeast-2): GET /subscriptions?email= lists rows,
// POST /subscribe saves one. The browser holds no AWS credentials; only the Lambdas touch AWS.
const API_URL =
  import.meta.env["VITE_FLIGHT_API_URL"] ??
  "https://3yke1ofvt0.execute-api.ap-southeast-2.amazonaws.com";

async function listSubscriptions(email: string): Promise<Subscription[]> {
  const res = await fetch(`${API_URL}/subscriptions?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const data = await res.json();
  return data.subscriptions ?? [];
}

async function saveSubscription(input: {
  email: string;
  plan_name: PlanName;
  target_price: number;
}) {
  const res = await fetch(`${API_URL}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  return res.json();
}

function PlanCard({
  email,
  plan,
  current,
}: {
  email: string;
  plan: (typeof PLANS)[number];
  current: Subscription | undefined;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(current ? String(current.target_price) : "");
  const mutation = useMutation({
    mutationFn: saveSubscription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscriptions", email] }),
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
          if (valid) mutation.mutate({ email, plan_name: plan.name, target_price: price });
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

export function SubscriptionPlans({ email }: { email: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["subscriptions", email],
    queryFn: () => listSubscriptions(email),
  });

  if (isLoading) return <p className="text-muted-foreground">載入訂閱中…</p>;
  if (isError) return <p className="text-destructive">讀取訂閱失敗，請重新整理。</p>;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <PlanCard
          key={plan.name}
          email={email}
          plan={plan}
          current={data?.find((s) => s.route === plan.route)}
        />
      ))}
    </div>
  );
}
