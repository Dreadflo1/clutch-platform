import { API_BASE } from "@/lib/site";
import { seedChallenges, type BoardResponse, type Challenge } from "@/lib/duels-data";

export const dynamic = "force-dynamic";

/**
 * Proxy the live platform's open challenge board so the browser never has to hit
 * the origin cross-domain, and the page degrades to the sample set whenever the
 * live API is unset, slow, or unreachable. Never throws to the client.
 */
export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE}/api/challenges`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as { challenges?: unknown };
      const challenges = Array.isArray(data.challenges) ? (data.challenges as Challenge[]) : [];
      if (challenges.length > 0) {
        const body: BoardResponse = { challenges, source: "live" };
        return Response.json(body);
      }
    }
  } catch {
    // fall through to the sample board
  }

  const body: BoardResponse = { challenges: seedChallenges, source: "sample" };
  return Response.json(body);
}
