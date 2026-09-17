import crypto from "node:crypto";

export const dynamic = "force-dynamic";

type ApplicationPayload = {
  name?: unknown;
  email?: unknown;
  handle?: unknown;
  primaryPlatform?: unknown;
  audienceSize?: unknown;
  motivation?: unknown;
};

type CleanApplication = {
  name: string;
  email: string;
  handle: string;
  primaryPlatform: string;
  audienceSize: string;
  motivation: string;
};

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Human-readable summary used for webhook / Telegram / log delivery. */
function formatApplication(id: string, a: CleanApplication) {
  return [
    "🎮 New CLUTCH ambassador application",
    `Ref: ${id}`,
    `Name: ${a.name}`,
    `Email: ${a.email}`,
    `Handle: ${a.handle}`,
    `Platform: ${a.primaryPlatform}`,
    `Community size: ${a.audienceSize}`,
    "",
    "How they activate their community:",
    a.motivation,
  ].join("\n");
}

/**
 * Deliver an application without a database. Tries, in order: a Discord/Slack
 * webhook, then a Telegram bot, then the server log. Returns true if it reached
 * a real channel (webhook/telegram). Never throws.
 */
async function deliver(message: string): Promise<boolean> {
  const webhook = process.env.APPLY_WEBHOOK_URL;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;

  const withTimeout = (ms: number) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };

  if (webhook) {
    try {
      // `content` satisfies Discord/Guilded, `text` satisfies Slack/Mattermost.
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message, text: message }),
        signal: withTimeout(5000),
      });
      if (res.ok) return true;
    } catch {
      /* fall through */
    }
  }

  if (tgToken && tgChat) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgChat, text: message, disable_web_page_preview: true }),
        signal: withTimeout(5000),
      });
      if (res.ok) return true;
    } catch {
      /* fall through */
    }
  }

  // Last resort: keep it in the server logs so a submission is never lost.
  console.log(`[ambassador:apply]\n${message}`);
  return false;
}

export async function POST(request: Request) {
  let body: ApplicationPayload;

  try {
    body = (await request.json()) as ApplicationPayload;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const values: CleanApplication = {
    name: cleanString(body.name, 120),
    email: cleanString(body.email, 180).toLowerCase(),
    handle: cleanString(body.handle, 100),
    primaryPlatform: cleanString(body.primaryPlatform, 40),
    audienceSize: cleanString(body.audienceSize, 40),
    motivation: cleanString(body.motivation, 1600),
  };

  if (!values.name || !values.handle || !values.primaryPlatform || !values.audienceSize || values.motivation.length < 20) {
    return Response.json({ error: "Please complete every field with enough detail." }, { status: 400 });
  }

  if (!/^\S+@\S+\.\S+$/.test(values.email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const applicationId = `AMB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  // Fire the notification (webhook / Telegram / log). Never blocks on failure.
  const delivered = await deliver(formatApplication(applicationId, values));

  return Response.json({
    applicationId,
    delivered,
    message: "Application received. We’ll be in touch within 5 business days.",
  });
}
