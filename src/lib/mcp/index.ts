import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "pixel-perfect-replica",
  title: "Pixel Perfect Replica",
  version: "0.1.0",
  instructions:
    "Tools for Flight Price Notifier, a flight fare alert app. Use `whoami` to confirm which account is connected.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool],
});
