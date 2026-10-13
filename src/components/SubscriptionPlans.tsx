import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plane } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PlanName = "tokyo" | "seoul" | "london";

type SubscriptionStatus = "pending_payment" | "active" | "cancelled" | "expired";

type Subscription = {
  route: string;
  plan_name: PlanName;
  target_price: number;
  currency: string;
  updated_at: string;
  subscription_status?: SubscriptionStatus;
  current_period_end?: string;
  current_period_end_date?: string;
};

const MONTHLY_FEE = 300;

// A cancelled subscription keeps alerting until the paid-through date (grace period).
const inGrace = (s: Subscription) =>
  s.subscription_status === "cancelled" &&
  (s.current_period_end ?? "") >= new Date().toISOString().slice(0, 19) + "Z";

// Paid rows update the target in place; anything else goes through ECPay checkout.
const isPaid = (s: Subscription | undefined) =>
  !!s && (s.subscription_status === "active" || inGrace(s));

const PLANS: { name: PlanName; label: string; route: string; hint: number }[] = [
  { name: "tokyo", label: "台北 ✈ 東京", route: "TPE-TYO", hint: 9325 },
  { name: "seoul", label: "台北 ✈ 首爾", route: "TPE-SEL", hint: 5989 },
  { name: "london", label: "台北 ✈ 倫敦", route: "TPE-LON", hint: 20743 },
];

const ntd = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

// flight-api (API Gateway + Lambda in ap-southeast-2): GET /subscriptions?email= lists rows,
// POST /subscribe saves one, POST /cancel stops the ECPay recurring charge. The browser holds no AWS credentials; only the Lambdas touch AWS.
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
  // text/html = ECPay auto-submit checkout form: hand the whole page to ECPay's cashier.
  // application/json = in-place target update for a paid subscription.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) {
    const html = await res.text();
    document.open();
    document.write(html);
    document.close();
    return { redirected: true };
  }
  return res.json();
}

async function cancelSubscription(input: { email: string; route: string }) {
  const res = await fetch(`${API_URL}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`cancel failed: ${res.status}`);
  return res.json();
}

function StatusBadge({ sub }: { sub: Subscription }) {
  switch (sub.subscription_status) {
    case "active":
      return <Badge>已訂閱（有效）</Badge>;
    case "cancelled":
      return inGrace(sub) ? (
        <Badge variant="secondary">已取消・有效至 {sub.current_period_end_date}</Badge>
      ) : (
        <Badge variant="outline">已結束</Badge>
      );
    case "expired":
      return <Badge variant="outline">已結束</Badge>;
    default:
      return <Badge variant="destructive">未完成付款</Badge>;
  }
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
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });
  const mutation = useMutation({ mutationFn: saveSubscription, onSuccess: refresh });
  const cancel = useMutation({ mutationFn: cancelSubscription, onSuccess: refresh });

  const price = Number(target);
  const valid = Number.isFinite(price) && price > 0;
  const paid = isPaid(current);
  const status = current?.subscription_status;

  let description: string;
  if (!current) description = `最近最低價約 ${ntd(plan.hint)}，設一個你願意出的價格。`;
  else if (status === "active")
    description = `目前目標價 ${ntd(current.target_price)}，低於這個價格就寄信通知你。下次續訂 ${current.current_period_end_date ?? ""}。`;
  else if (paid)
    description = `已取消續訂，${current.current_period_end_date} 前仍會依目標價 ${ntd(current.target_price)} 通知你。`;
  else if (status === "pending_payment" || !status)
    description = `目標價 ${ntd(current.target_price)} 已儲存，完成付款後才會開始寄送通知。`;
  else description = `訂閱已結束，重新訂閱即可恢復通知。`;

  let submitLabel: string;
  if (paid) submitLabel = "更新目標價";
  else if (current && (status === "pending_payment" || !status)) submitLabel = "完成付款";
  else if (current) submitLabel = "重新訂閱";
  else submitLabel = `訂閱 NT$${MONTHLY_FEE}/月`;

  return (
    <div className="glass-panel relative rounded-[1.5rem] border border-white/80 p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Plane className="h-5 w-5" />
          {plan.label}
        </h2>
        {current && <StatusBadge sub={current} />}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
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
          {mutation.isPending ? (paid ? "儲存中…" : "前往付款…") : submitLabel}
        </Button>
      </form>
      {!paid && (
        <p className="mt-2 text-xs text-muted-foreground">
          每條航線 NT${MONTHLY_FEE}/月，透過綠界 ECPay 信用卡定期定額扣款，可隨時取消。
        </p>
      )}
      {status === "active" && (
        <Button
          variant="link"
          className="mt-2 h-auto px-0 text-sm text-muted-foreground"
          disabled={cancel.isPending}
          onClick={() => {
            if (
              window.confirm(
                `確定要取消 ${plan.label} 的訂閱嗎？已付費的這一期仍會繼續通知到期滿。`,
              )
            )
              cancel.mutate({ email, route: plan.route });
          }}
        >
          {cancel.isPending ? "取消中…" : "取消訂閱"}
        </Button>
      )}
      {mutation.isError && <p className="mt-2 text-sm text-destructive">儲存失敗，請稍後再試。</p>}
      {cancel.isError && <p className="mt-2 text-sm text-destructive">取消失敗，請稍後再試。</p>}
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
