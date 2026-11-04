import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { checkoutAmount } from "./money";
import type { Draft } from "./types";

function bearer(context: { userId: string; bearerToken?: string }) {
  return { userId: context.userId, token: context.bearerToken };
}

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listFor } = await import("./ledger.server");
    return listFor(bearer(context).userId, bearer(context).token);
  });

export const teamInfo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { teamForCaller } = await import("./ledger.server");
    return teamForCaller(bearer(context).userId, bearer(context).token);
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string }) => {
    const email = input?.email?.trim().toLowerCase() ?? "";
    if (!email.includes("@")) throw new Error("Enter a teammate's email.");
    return { email };
  })
  .handler(async ({ data, context }) => {
    const { inviteToTeam } = await import("./ledger.server");
    return inviteToTeam(bearer(context).userId, bearer(context).token, data.email);
  });

export const openInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { draft: Draft }) => {
    const draft = input?.draft;
    if (!draft?.recipientEmail?.includes("@") || !draft.items?.length) {
      throw new Error("That draft is missing an email or a line item.");
    }
    checkoutAmount(draft);
    return { draft };
  })
  .handler(async ({ data, context }) => {
    const { openFor } = await import("./ledger.server");
    return openFor(bearer(context).userId, bearer(context).token, data.draft);
  });

export const changeInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: "reminded" | "paid" | "cancelled" }) => {
    if (!input?.id || !["reminded", "paid", "cancelled"].includes(input.status)) {
      throw new Error("That bill cannot be changed.");
    }
    return { id: input.id, status: input.status };
  })
  .handler(async ({ data, context }) => {
    const { changeFor } = await import("./ledger.server");
    return changeFor(bearer(context).userId, bearer(context).token, data.id, data.status);
  });

export const syncInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => {
    if (!input?.id) throw new Error("That bill is not on your team.");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { syncFor } = await import("./ledger.server");
    return syncFor(bearer(context).userId, bearer(context).token, data.id);
  });

export const connectPayPalWebhook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { connectWebhook } = await import("./ledger.server");
    return connectWebhook(bearer(context).userId, bearer(context).token);
  });
