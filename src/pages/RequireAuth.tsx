import { useEffect, useState } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AuthedContext = { queryClient: QueryClient; user: User };

// Client-only gate: the session lives in browser storage, so check it here and
// send signed-out visitors to /signin.
export function RequireAuth() {
  const { queryClient } = useOutletContext<{ queryClient: QueryClient }>();
  const [state, setState] = useState<
    { status: "loading" } | { status: "out" } | { status: "in"; user: User }
  >({
    status: "loading",
  });

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setState(error || !data.user ? { status: "out" } : { status: "in", user: data.user });
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") return null;
  if (state.status === "out") return <Navigate to="/signin" replace />;
  return <Outlet context={{ queryClient, user: state.user } satisfies AuthedContext} />;
}
