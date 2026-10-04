// Polar calls this when an order is paid. It verifies the signature, answers right away,
// and makes the AI draft in the background: it waits in the desk, or in auto mode goes out when confident.
// Env: POLAR_WEBHOOK_SECRET (from Polar → Settings → Webhooks), plus what the draft needs.
import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { isVerdictOrder, resultId } from "./_lib.js";
import { aiReady, processPaidOrder, savedDrafts } from "./_ai.js";

const TOLERANCE_S = 5 * 60;

// Polar signs with the Standard Webhooks scheme: HMAC-SHA256 over "id.timestamp.body",
// keyed with the secret's UTF-8 bytes (as Polar's own SDK does), sent as space-separated "v1,<base64>" entries.
function verify(headers, body, secret) {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_S) return false;
  const expected = crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

async function draftOnce(order) {
  if ((await savedDrafts()).has(resultId(order.id))) return;
  await processPaidOrder(order);
}

export async function POST(request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET || "";
  const body = await request.text();
  if (!secret || !verify(request.headers, body, secret)) return new Response("Bad signature.", { status: 403 });

  let event;
  try {
    event = JSON.parse(body);
  } catch (_) {
    return new Response("Bad body.", { status: 400 });
  }
  const order = event?.data;
  if (event?.type === "order.paid" && order?.id && isVerdictOrder(order) && aiReady()) {
    waitUntil(draftOnce(order).catch((err) => console.error("Webhook draft failed:", order.id, err)));
  }
  return new Response(null, { status: 202 });
}
