import { getDb } from "@/db";
import { ambassadorApplications } from "@/db/schema";

export const dynamic = "force-dynamic";

type ApplicationPayload = {
  name?: unknown;
  email?: unknown;
  handle?: unknown;
  primaryPlatform?: unknown;
  audienceSize?: unknown;
  motivation?: unknown;
};

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  let body: ApplicationPayload;

  try {
    body = (await request.json()) as ApplicationPayload;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const values = {
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

  const [application] = await getDb()
    .insert(ambassadorApplications)
    .values(values)
    .returning({ id: ambassadorApplications.id });

  return Response.json({
    applicationId: application.id,
    message: "Application received. We’ll be in touch within 5 business days.",
  });
}
