// Polar calls this when something is paid, refunded, or a subscription changes. It checks the signature,
// answers right away, and switches the membership on in the background: the Kill Sheet scout starts, or
// Stay Alive's monitoring and first re-stamp run. The dashboard shows it as soon as it's saved.
// Env: POLAR_WEBHOOK_SECRET (Polar → Settings → Webhooks → the endpoint's secret).
import { waitUntil } from "@vercel/functions";
import { handleEvent, verifyWebhook } from "./_billing.js";

export async function POST(request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET || "";
  const body = await request.text();
  if (!secret) {
    console.error("POLAR_WEBHOOK_SECRET is not set: a Polar event was refused.");
    return new Response("Not set up.", { status: 503 });
  }
  if (!verifyWebhook(request.headers, body, secret)) return new Response("Bad signature.", { status: 403 });
  let event;
  try {
    event = JSON.parse(body);
  } catch (_) {
    return new Response("Bad body.", { status: 400 });
  }
  waitUntil(handleEvent(event).catch((err) => console.error("Polar event failed:", event?.type, event?.data?.id, err)));
  return new Response(null, { status: 202 });
}
