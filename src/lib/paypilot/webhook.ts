export function orderIdFromWebhook(event: {
  event_type?: string;
  resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
}): string | null {
  const type = event.event_type ?? "";
  const resource = event.resource;
  if (!resource) return null;
  if (type === "CHECKOUT.ORDER.COMPLETED" && resource.id) return resource.id;
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    const orderId = resource.supplementary_data?.related_ids?.order_id;
    return orderId || null;
  }
  return null;
}
