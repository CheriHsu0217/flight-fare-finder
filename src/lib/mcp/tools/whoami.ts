import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in Flight Price Notifier account's user id and email.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const user = { id: ctx.getUserId() ?? "", email: ctx.getUserEmail() ?? "" };
    return {
      content: [{ type: "text", text: `Signed in as ${user.email || user.id}` }],
      structuredContent: { user },
    };
  },
});
