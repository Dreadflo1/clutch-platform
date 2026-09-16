import { getDb } from "@/db";
import { ambassadorActivities } from "@/db/schema";
import { missions, rewards, startingPoints } from "@/lib/program-data";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ambassadorId = "demo-ambassador";

type ActivityRequest = {
  actionType?: unknown;
  actionId?: unknown;
};

function balanceOf(rows: { points: number }[]) {
  return startingPoints + rows.reduce((total, row) => total + row.points, 0);
}

export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(ambassadorActivities)
    .where(eq(ambassadorActivities.ambassadorId, ambassadorId))
    .orderBy(desc(ambassadorActivities.createdAt));

  return Response.json({ activities: rows, points: balanceOf(rows) });
}

export async function POST(request: Request) {
  let body: ActivityRequest;

  try {
    body = (await request.json()) as ActivityRequest;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (
    (body.actionType !== "mission" && body.actionType !== "reward") ||
    typeof body.actionId !== "string"
  ) {
    return Response.json({ error: "A valid action type and item are required." }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(ambassadorActivities)
    .where(eq(ambassadorActivities.ambassadorId, ambassadorId));

  if (
    existing.some(
      (activity) =>
        activity.actionType === body.actionType && activity.actionId === body.actionId,
    )
  ) {
    return Response.json(
      { error: body.actionType === "mission" ? "Mission already submitted." : "Reward already claimed." },
      { status: 409 },
    );
  }

  const mission = body.actionType === "mission" ? missions.find((item) => item.id === body.actionId) : undefined;
  const reward = body.actionType === "reward" ? rewards.find((item) => item.id === body.actionId) : undefined;
  const selected = mission ?? reward;

  if (!selected) {
    return Response.json({ error: "That program item does not exist." }, { status: 404 });
  }

  const points = mission ? mission.points : -(reward?.points ?? 0);
  const itemTitle = mission ? mission.title : reward?.name ?? "Program reward";
  const currentPoints = balanceOf(existing);

  if (reward && currentPoints < reward.points) {
    return Response.json({ error: `You need ${reward.points - currentPoints} more points.` }, { status: 422 });
  }

  try {
    const [activity] = await db
      .insert(ambassadorActivities)
      .values({
        ambassadorId,
        actionType: body.actionType,
        actionId: body.actionId,
        title: itemTitle,
        points,
      })
      .returning();

    return Response.json({
      activity,
      points: currentPoints + points,
      message: mission ? "Mission submitted for review." : "Reward claimed successfully.",
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") {
      return Response.json({ error: "This item was already claimed." }, { status: 409 });
    }
    throw error;
  }
}
