type WebhookEvent =
  | { type: "payment_intent.succeeded"; data: unknown }
  | { type: "checkout.session.completed"; data: unknown };

export function handleWebhook(event: WebhookEvent) {
  if (event.type === "payment_intent.succeeded") {
    return processPayment(event.data);
  }
  if (event.type === "checkout.session.completed") {
    return processCheckout(event.data);
  }
}

function processPayment(_data: unknown) {}
function processCheckout(_data: unknown) {}
