import type { Metadata } from "next";
import Link from "next/link";
import { APP_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Dashboard | CLUTCH",
  description: "Your CLUTCH overview — duels, balance, leaderboard and performance.",
};

export default function DashboardPage() {
  return (
    <div>
      <div className="dash-welcome">
        <h2>Welcome back</h2>
        <p>Here&apos;s your challenge overview.</p>
      </div>

      <div className="dash-grid">
        <div className="stat-card">
          <div className="sc-icon" style={{ background: "var(--acc-lo)" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2l2 5h5l-4 3 1.5 5L9 12.5 4.5 15 6 10 2 7h5z" fill="var(--acc)" />
            </svg>
          </div>
          <div className="sc-val" style={{ color: "var(--acc)" }}>0</div>
          <div className="sc-lbl">Duels Won</div>
        </div>
        <div className="stat-card">
          <div className="sc-icon" style={{ background: "var(--gold-lo)" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="6" fill="none" stroke="var(--gold)" strokeWidth="2" />
              <path d="M9 6v3l2 2" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="sc-val" style={{ color: "var(--gold)" }}>0</div>
          <div className="sc-lbl">CLU Balance</div>
        </div>
        <div className="stat-card">
          <div className="sc-icon" style={{ background: "var(--purple-lo)" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="2" width="14" height="14" rx="3" fill="none" stroke="var(--purple)" strokeWidth="1.5" />
              <path d="M6 9h6M9 6v6" stroke="var(--purple)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="sc-val" style={{ color: "var(--purple-txt)" }}>0</div>
          <div className="sc-lbl">Active Duels</div>
        </div>
        <div className="stat-card">
          <div className="sc-icon" style={{ background: "var(--red-lo)" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 3v6l4 2" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="9" cy="9" r="7" stroke="var(--red)" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
          <div className="sc-val" style={{ color: "var(--txt2)" }}>0</div>
          <div className="sc-lbl">Total Duels</div>
        </div>
      </div>

      <div className="dash-cols">
        <div className="panel">
          <div className="panel-hdr">
            <span className="panel-title">My Duels</span>
            <Link className="panel-action" href="/duels">View all →</Link>
          </div>
          <div className="panel-body">
            <div className="cx-empty">
              No duels yet. <Link className="panel-action" href="/duels">Find an opponent →</Link>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel">
            <div className="panel-hdr">
              <span className="panel-title">Leaderboard</span>
              <span className="panel-action" style={{ opacity: 0.6 }}>Soon</span>
            </div>
            <div className="panel-body">
              <div className="cx-empty">Rankings arrive with the leaderboard port.</div>
            </div>
          </div>

          <div
            className="panel"
            style={{ background: "linear-gradient(135deg,var(--gold-lo),rgba(155,92,246,.06))", borderColor: "rgba(232,160,32,.2)" }}
          >
            <div className="panel-hdr" style={{ borderColor: "rgba(232,160,32,.15)" }}>
              <span className="panel-title" style={{ color: "var(--gold)" }}>CLU Tokens</span>
              <a className="panel-action" href={APP_URL}>Buy →</a>
            </div>
            <div className="panel-body">
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--gold)", marginBottom: 4 }}>0</div>
              <div style={{ fontSize: 12, color: "var(--txt2)", marginBottom: 16 }}>
                CLU available · <span style={{ color: "var(--purple-txt)" }}>0</span> in escrow
              </div>
              <a className="btn btn-gold btn-full btn-sm" href={APP_URL}>Get more tokens</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
