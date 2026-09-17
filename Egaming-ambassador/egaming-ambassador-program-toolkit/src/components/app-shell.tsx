"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BarChart3,
  ChevronRight,
  FileText,
  Gamepad2,
  History,
  LayoutGrid,
  LayoutList,
  LogIn,
  Plus,
  Swords,
  Ticket,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { APP_URL } from "@/lib/site";

type NavItem = { label: string; href?: string; icon: LucideIcon; badge?: string };
type NavSection = { title: string; items: NavItem[] };

/** Sidebar map. Items without an href are ports still in progress ("Soon"). */
const NAV: NavSection[] = [
  {
    title: "Play",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
      { label: "New Challenge", icon: Plus },
      { label: "Accept Code", icon: Ticket },
      { label: "Challenge Board", href: "/duels", icon: LayoutList },
      { label: "My Duels", icon: Swords },
    ],
  },
  {
    title: "Community",
    items: [{ label: "Ambassadors", href: "/ambassadors", icon: Users }],
  },
  {
    title: "Account",
    items: [
      { label: "Wallet", icon: Wallet },
      { label: "History", icon: History },
      { label: "Get Tokens", icon: Ticket },
      { label: "Leaderboard", icon: BarChart3 },
      { label: "Terms", icon: FileText },
      { label: "Profile", icon: User },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/duels": "Challenge Board",
  "/ambassadors": "Ambassador HQ",
};

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const title = TITLES[pathname] ?? "CLUTCH";

  return (
    <div className="cx-shell">
      <aside className={`cx-sidebar${open ? " is-open" : ""}`}>
        <Link className="sidebar-logo" href="/" aria-label="Clutch home">
          <span className="sidebar-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M14.5 17.5 3 6V3h3l11.5 11.5" stroke="#000" strokeWidth={2.5} strokeLinecap="round" />
              <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" stroke="#000" strokeWidth={2.5} strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" fill="#000" opacity={0.3} />
            </svg>
          </span>
          <span className="sidebar-logo-name">
            <em>CLUTCH</em>
          </span>
        </Link>

        <div className="sidebar-player">
          <div className="sp-top">
            <span className="sp-avatar">G</span>
            <div style={{ minWidth: 0 }}>
              <div className="sp-name">Guest</div>
              <div className="sp-addr">guest</div>
            </div>
          </div>
          <div className="sp-balance">
            <div>
              <div className="sp-bal-val">
                0 <span style={{ fontSize: 11, color: "var(--txt3)", fontWeight: 600 }}>CLU</span>
              </div>
              <div className="sp-in-escrow">
                In escrow: <span>0</span> CLU
              </div>
            </div>
            <ChevronRight size={14} color="var(--txt3)" />
          </div>
        </div>

        <PlayerSnapshot />

        <nav className="sidebar-nav" aria-label="App sections">
          {NAV.map((section) => (
            <div key={section.title}>
              <div className="snav-section">{section.title}</div>
              {section.items.map((item) => {
                const active = item.href === pathname;
                const Icon = item.icon;
                const inner = (
                  <>
                    <span className="snav-icon">
                      <Icon size={18} />
                    </span>
                    {item.label}
                    {!item.href && <span className="snav-badge" style={{ background: "var(--l3)", color: "var(--txt3)" }}>Soon</span>}
                  </>
                );
                return item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`snav-item${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={item.label} className="snav-item" style={{ opacity: 0.6, cursor: "default" }} aria-disabled="true">
                    {inner}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <a className="disconnect-btn" href={APP_URL}>
            <LogIn size={16} /> Sign in to play
          </a>
        </div>
      </aside>

      <div className="cx-main">
        <div className="cx-top">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              className="topbar-notif"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              style={{ display: "none" }}
              data-mobile-menu
            >
              <LayoutGrid size={16} />
            </button>
            <div className="topbar-title">{title}</div>
          </div>
          <div className="topbar-right">
            <div className="topbar-notif" aria-label="Notifications">
              <Bell size={16} />
            </div>
            <a className="topbar-bal" href={APP_URL}>
              <Gamepad2 size={12} color="var(--gold)" />
              <span className="topbar-bal-num">0</span>
              <span className="topbar-bal-unit">CLU</span>
            </a>
          </div>
        </div>
        <div className="cx-content" role="main">
          {children}
        </div>
      </div>
    </div>
  );
}

function PlayerSnapshot() {
  return (
    <div className="sidebar-stats">
      <div className="sidebar-stats-label">
        <span>Player Snapshot</span>
        <em>#GUEST</em>
      </div>

      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id="sb-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1CFFB4" />
            <stop offset="55%" stopColor="#00DC78" />
            <stop offset="100%" stopColor="#00A955" />
          </linearGradient>
        </defs>
      </svg>

      <div className="sb-hero">
        <div className="sb-ring" aria-label="Win rate">
          <svg viewBox="0 0 42 42">
            <circle className="sb-ring-track" cx="21" cy="21" r="18.5" />
            <circle className="sb-ring-fill" cx="21" cy="21" r="18.5" strokeDasharray="116.24" strokeDashoffset="116.24" pathLength={1} />
          </svg>
          <div className="sb-ring-inner">
            <div className="sb-ring-val">0%</div>
            <div className="sb-ring-wl">0W · 0L</div>
          </div>
        </div>
        <div className="sb-hero-info">
          <span className="sb-hero-lbl">Net P&amp;L</span>
          <div className="sb-hero-netline">
            <span className="sb-hero-net-num neu">0</span>
            <span className="sb-hero-unit">CLU</span>
          </div>
          <span className="sb-hero-hist">No duels yet</span>
        </div>
      </div>

      <div className="sb-perf">
        <div className="sb-pill-mini s-purple" title="Active challenges">
          <span className="pm-lbl">Live</span>
          <span className="pm-val">0</span>
        </div>
        <div className="sb-trend" title="Last 8 duels">
          <div className="sb-trend-head">
            <span className="sb-trend-lbl">Recent form</span>
            <span className="sb-trend-wl">
              <span className="w">0W</span>
              <span className="div">·</span>
              <span className="l">0L</span>
            </span>
          </div>
          <div className="sb-spark">
            {Array.from({ length: 8 }).map((_, i) => (
              <span className="n" key={i} />
            ))}
          </div>
        </div>
      </div>

      <Link className="sb-bestgame" href="/duels">
        <span className="sb-bg-icon">
          <Gamepad2 size={16} />
        </span>
        <div className="sb-bg-info">
          <div className="sb-bg-name">Browse the board</div>
          <div className="sb-bg-meta">Guest · Open challenges</div>
        </div>
        <ChevronRight className="sb-bg-arrow" size={14} />
      </Link>
    </div>
  );
}
