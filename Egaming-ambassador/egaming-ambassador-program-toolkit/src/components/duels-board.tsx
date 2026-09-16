"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Plus,
  ShieldCheck,
  Star,
} from "lucide-react";
import {
  GAMES,
  gameById,
  isFree,
  expiresIn,
  type BoardResponse,
  type Challenge,
} from "@/lib/duels-data";
import { arenaUrl, APP_URL } from "@/lib/site";

type Sort = "newest" | "highest" | "expiring";
type ViewMode = "grid" | "list";

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "highest", label: "Highest stake" },
  { id: "expiring", label: "Expiring soon" },
];

export default function DuelsBoard() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [source, setSource] = useState<BoardResponse["source"]>("sample");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setView] = useState<ViewMode>("grid");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/duels")
      .then((r) => r.json() as Promise<BoardResponse>)
      .then((data) => {
        if (!alive) return;
        setChallenges(Array.isArray(data.challenges) ? data.challenges : []);
        setSource(data.source ?? "sample");
      })
      .catch(() => {
        if (alive) setSource("sample");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const gamesPresent = useMemo(() => {
    const ids = new Set(challenges.map((c) => c.game));
    return GAMES.filter((g) => ids.has(g.id));
  }, [challenges]);

  const visible = useMemo(() => {
    let out = challenges.slice();
    if (filter !== "all") out = out.filter((c) => c.game === filter);
    if (verifiedOnly) out = out.filter((c) => c.verified);
    if (sort === "highest") out.sort((a, b) => b.stake - a.stake);
    else if (sort === "expiring") out.sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
    else out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return out;
  }, [challenges, filter, verifiedOnly, sort]);

  return (
    <div className="db">
      <div className="db-head">
        <div>
          <h1 className="db-title">Challenge Board</h1>
          <p className="db-sub">Open challenges from players looking for an opponent. Skill only — no odds, no house.</p>
        </div>
        <a className="db-post" href={APP_URL}>
          <Plus size={15} /> Post a challenge
        </a>
      </div>

      {source === "sample" && !loading && (
        <div className="db-banner" role="status">
          <ShieldCheck size={15} />
          <span>
            Showing a <strong>sample board</strong>. Connect the live API (<code>API_BASE</code>) to stream real open
            challenges here.
          </span>
        </div>
      )}

      <div className="db-pills" role="tablist" aria-label="Filter by game">
        <button
          className={`db-pill${filter === "all" ? " is-active" : ""}`}
          onClick={() => setFilter("all")}
          role="tab"
          aria-selected={filter === "all"}
        >
          All games
        </button>
        {gamesPresent.map((g) => (
          <button
            key={g.id}
            className={`db-pill${filter === g.id ? " is-active" : ""}`}
            onClick={() => setFilter(g.id)}
            role="tab"
            aria-selected={filter === g.id}
            style={filter === g.id ? { borderColor: g.color, color: g.color } : undefined}
          >
            <span className="db-pill-dot" style={{ background: g.color }} aria-hidden="true" />
            {g.name}
          </button>
        ))}
      </div>

      <div className="db-toolbar">
        <label className="db-sort">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="db-check">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          Verified players
        </label>
        <div className="db-views" role="group" aria-label="Layout">
          <button
            className={`db-view${view === "grid" ? " is-active" : ""}`}
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            className={`db-view${view === "list" ? " is-active" : ""}`}
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
          >
            <ListIcon size={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="db-loading">
          <Loader2 size={22} className="db-spin" /> Loading the board…
        </div>
      ) : visible.length === 0 ? (
        <div className="db-empty">
          <h2>No open challenges match</h2>
          <p>Clear a filter, or be the first to post one.</p>
          <a className="db-post" href={APP_URL}>
            <Plus size={15} /> Post a challenge
          </a>
        </div>
      ) : (
        <div className={`db-grid${view === "list" ? " is-list" : ""}`}>
          {visible.map((c) => (
            <ChallengeCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChallengeCard({ c }: { c: Challenge }) {
  const g = gameById(c.game);
  const free = isFree(c);
  const initial = (c.creatorName || "?").charAt(0).toUpperCase();
  const mode = c.modeLabel || c.mode || "Custom challenge";

  return (
    <article className={`db-card${free ? " is-free" : ""}`} data-id={c.id}>
      <header className="db-card-head">
        <span className="db-game" style={{ color: g.color }}>
          <span className="db-game-dot" style={{ background: g.color }}>
            {g.short}
          </span>
          {g.name}
        </span>
        {free ? (
          <span className="db-tag db-tag-free">
            <Star size={11} fill="currentColor" /> Free
          </span>
        ) : (
          <span className="db-tag db-tag-paid">CLU stake</span>
        )}
      </header>

      <div className="db-player">
        <span className="db-avatar" style={{ background: `${g.color}22`, color: g.color, borderColor: `${g.color}55` }}>
          {initial}
        </span>
        <div className="db-player-meta">
          <span className="db-player-name">
            {c.creatorName}
            {c.verified && <BadgeCheck size={13} className="db-verify" aria-label="Verified player" />}
          </span>
          <span className="db-player-rank">{c.rank || `${c.creatorWins ?? 0} wins`}</span>
        </div>
      </div>

      <p className="db-mode">
        {mode}
        {c.modeVerifiable && (
          <span className="db-autoverify" title={`Auto-verified via ${g.apiName ?? "game API"}`}>
            <ShieldCheck size={11} /> Auto-verified
          </span>
        )}
      </p>

      <footer className="db-card-foot">
        <div className="db-stake">
          {free ? (
            <>
              <span className="db-stake-num db-stake-free">0</span>
              <span className="db-stake-unit">No escrow</span>
            </>
          ) : (
            <>
              <span className="db-stake-num">{c.stake.toLocaleString()}</span>
              <span className="db-stake-unit">CLU</span>
            </>
          )}
          {c.expiresAt && <span className="db-expiry">{expiresIn(c.expiresAt)}</span>}
        </div>
        <a className="db-accept" href={arenaUrl(c.id)} style={{ ["--g" as string]: g.color }}>
          Accept <ArrowUpRight size={14} />
        </a>
      </footer>
    </article>
  );
}
