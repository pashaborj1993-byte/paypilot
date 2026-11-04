import { createServerFn } from "@tanstack/react-start";
import { checkoutAmount } from "./money";
import type { Draft } from "./types";

export const recordPayPalInvoice = createServerFn({ method: "POST" })
  .validator((input: { draft: Draft; number: string }) => {
    const number = input?.number?.trim() ?? "";
    const draft = input?.draft;
    if (!/^PP-\d+$/.test(number) || !draft?.recipientEmail?.includes("@") || !draft.items?.length) {
      throw new Error("That draft is missing an email or a line item.");
    }
    checkoutAmount(draft);
    return { draft, number };
  })
  .handler(async ({ data }) => {
    const { createCheckout } = await import("./paypal.server");
    return createCheckout(data.draft, data.number);
  });

export const paypalFollowUp = createServerFn({ method: "POST" })
  .validator((input: { action: "paid" | "status"; paypalId: string }) => {
    if (!input?.paypalId || (input.action !== "paid" && input.action !== "status")) {
      throw new Error("That invoice is not on PayPal.");
    }
    return { action: input.action, paypalId: input.paypalId };
  })
  .handler(async ({ data }) => {
    const paypal = await import("./paypal.server");
    if (data.action === "status") return paypal.orderStatus(data.paypalId);
    return paypal.capturePaid(data.paypalId);
  });
