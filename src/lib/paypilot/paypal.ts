import { createServerFn } from "@tanstack/react-start";
import type { Draft } from "./types";

export const recordPayPalInvoice = createServerFn({ method: "POST" })
  .validator((input: { draft: Draft; number: string }) => {
    const number = input?.number?.trim() ?? "";
    const draft = input?.draft;
    if (!/^PP-\d+$/.test(number) || !draft?.recipientEmail?.includes("@") || !draft.items?.length) {
      throw new Error("That draft is missing an email or a line item.");
    }
    return { draft, number };
  })
  .handler(async ({ data }) => {
    const { createCheckout } = await import("./paypal.server");
    return createCheckout(data.draft, data.number);
  });

export const paypalFollowUp = createServerFn({ method: "POST" })
  .validator((input: { action: "paid"; paypalId: string }) => {
    if (!input?.paypalId || input.action !== "paid") throw new Error("That invoice is not on PayPal.");
    return { paypalId: input.paypalId };
  })
  .handler(async ({ data }) => {
    const { capturePaid } = await import("./paypal.server");
    return capturePaid(data.paypalId);
  });
