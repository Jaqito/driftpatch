import Anthropic from "@anthropic-ai/sdk";
import { withApiAuthRequired } from "@auth0/nextjs-auth0";
import Stripe from "stripe";

const stripe = new Stripe("sk_test_...");
const client = new Anthropic();

export const handler = withApiAuthRequired(async () => {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [],
  });

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [{ role: "user", content: session.id }],
  });

  return response;
});
