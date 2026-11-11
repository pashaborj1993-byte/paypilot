import { createFileRoute } from "@tanstack/react-router";
import { orderIdFromWebhook } from "@/lib/paypilot/webhook";

export const Route = createFileRoute("/api/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let event: Parameters<typeof orderIdFromWebhook>[0];
        try {
          event = (await request.json()) as Parameters<typeof orderIdFromWebhook>[0];
        } catch {
          return new Response("rejected", { status: 400 });
        }
        const { verifyWebhook } = await import("@/lib/paypilot/paypal.server");
        const { markPaidByPaypalOrder, webhookId } = await import("@/lib/paypilot/ledger.server");
        const id = await webhookId();
        if (!id) return new Response("webhook is not registered", { status: 400 });
        const verified = await verifyWebhook(request.headers, event, id);
        if (!verified) return new Response("rejected", { status: 400 });
        const orderId = orderIdFromWebhook(event);
        if (orderId) await markPaidByPaypalOrder(orderId);
        return new Response("ok");
      },
    },
  },
});
