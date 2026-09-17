"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Crown,
  Download,
  FileText,
  Filter,
  Gamepad2,
  Gift,
  ImageIcon,
  LayoutDashboard,
  Library,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageSquareText,
  MonitorUp,
  MoreHorizontal,
  Package,
  Play,
  Plus,
  Rocket,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  contentAssets,
  games,
  launchSteps,
  missions,
  rewards,
  rooms,
  startingPoints,
  tiers,
  type ContentAsset,
  type Mission,
  type Room,
  type RoomStatus,
} from "@/lib/program-data";

type View = "overview" | "missions" | "content" | "referrals" | "rooms" | "rewards" | "playbook";
type Activity = {
  id: number;
  actionType: string;
  actionId: string;
  title: string;
  points: number;
  createdAt: string;
};

type ToastState = { message: string; tone: "success" | "error" } | null;

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "missions", label: "Missions", icon: Target },
  { id: "content", label: "Content hub", icon: Library },
  { id: "referrals", label: "Referrals", icon: Link2 },
  { id: "rooms", label: "Rooms admin", icon: Gamepad2 },
  { id: "rewards", label: "Rewards & swag", icon: Gift },
  { id: "playbook", label: "Program playbook", icon: BookOpen },
];

const toneStyles = {
  lime: "tone-lime",
  violet: "tone-violet",
  cyan: "tone-cyan",
  orange: "tone-orange",
};

function Logo() {
  return (
    <div className="brand-lockup" aria-label="CLUTCH ambassador program">
      <span className="brand-mark">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14.5 17.5 3 6V3h3l11.5 11.5" stroke="#04130a" strokeWidth={2.5} strokeLinecap="round" />
          <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" stroke="#04130a" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" fill="#04130a" opacity={0.3} />
        </svg>
      </span>
      <span className="brand-name">CLUTCH</span>
      <span className="brand-pill">AMBASSADOR</span>
    </div>
  );
}

function MiniAvatar({ initials, color = "lime" }: { initials: string; color?: string }) {
  return <span className={`mini-avatar avatar-${color}`}>{initials}</span>;
}

function Sidebar({
  active,
  onNavigate,
  mobileOpen,
  closeMobile,
}: {
  active: View;
  onNavigate: (view: View) => void;
  mobileOpen: boolean;
  closeMobile: () => void;
}) {
  return (
    <>
      {mobileOpen && <button className="mobile-scrim" onClick={closeMobile} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Link href="/" aria-label="Back to Clutch platform" style={{ textDecoration: "none", color: "inherit" }}><Logo /></Link>
          <button className="icon-button mobile-close" onClick={closeMobile} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-icon"><Gamepad2 size={18} /></span>
          <span><small>Program</small><strong>Spring Split</strong></span>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav" aria-label="Ambassador workspace">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${active === item.id ? "active" : ""}`}
                onClick={() => { onNavigate(item.id); closeMobile(); }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === "missions" && <span className="nav-count">6</span>}
              </button>
            );
          })}
        </nav>
        <div className="season-card">
          <div className="season-icon"><Trophy size={21} /></div>
          <p className="eyebrow">Season 02</p>
          <h3>Road to Elite</h3>
          <p>1,820 points left to unlock the full creator drop.</p>
          <div className="mini-progress"><span style={{ width: "64%" }} /></div>
          <button onClick={() => onNavigate("rewards")}>View progress <ArrowRight size={14} /></button>
        </div>
        <div className="sidebar-profile">
          <MiniAvatar initials="AM" />
          <span><strong>Alex Morgan</strong><small>@alexplays</small></span>
          <MoreHorizontal size={18} />
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu, onApply, search, setSearch }: { onMenu: () => void; onApply: () => void; search: string; setSearch: (value: string) => void }) {
  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
      <div className="top-search">
        <Search size={17} />
        <input aria-label="Search program" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search missions, tools, rewards…" />
        <kbd>⌘ K</kbd>
      </div>
      <div className="top-actions">
        <button className="invite-button" onClick={onApply}><UserPlus size={16} /> <span>Invite creator</span></button>
        <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><span /></button>
        <div className="top-avatar"><MiniAvatar initials="AM" /><span className="online-dot" /></div>
      </div>
    </header>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow green">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, change, detail, tone }: { icon: typeof Zap; label: string; value: string; change: string; detail: string; tone: keyof typeof toneStyles }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${toneStyles[tone]}`}><Icon size={19} /></div>
      <div className="stat-top"><span>{label}</span><MoreHorizontal size={17} /></div>
      <div className="stat-value"><strong>{value}</strong><span><TrendingUp size={12} /> {change}</span></div>
      <p>{detail}</p>
    </article>
  );
}

function MissionVisual({ mission, compact = false }: { mission: Mission; compact?: boolean }) {
  const Icon = mission.category === "Competition" ? Trophy : mission.category === "Content" ? Play : Users;
  return (
    <div className={`mission-visual ${toneStyles[mission.tone]} ${compact ? "compact" : ""}`}>
      <span className="visual-grid" />
      <span className="visual-ring ring-one" />
      <span className="visual-ring ring-two" />
      <Icon size={compact ? 25 : 34} />
    </div>
  );
}

function MissionCard({ mission, claimed, loading, onClaim, compact = false }: { mission: Mission; claimed: boolean; loading: boolean; onClaim: (mission: Mission) => void; compact?: boolean }) {
  return (
    <article className={`mission-card ${compact ? "compact-card" : ""}`}>
      <MissionVisual mission={mission} compact={compact} />
      <div className="mission-body">
        <div className="mission-meta">
          <span className="category-label">{mission.category}</span>
          <span className="points"><Zap size={12} fill="currentColor" /> +{mission.points}</span>
        </div>
        <h3>{mission.title}</h3>
        <p>{mission.description}</p>
        <div className="mission-details">
          <span><Clock3 size={13} /> {mission.due}</span>
          <span><Users size={13} /> {mission.participants} joined</span>
        </div>
        <button className={`mission-action ${claimed ? "claimed" : ""}`} disabled={claimed || loading} onClick={() => onClaim(mission)}>
          {loading ? <><LoaderCircle className="spin" size={15} /> Submitting</> : claimed ? <><Check size={15} /> Submitted</> : <>View mission <ArrowUpRight size={15} /></>}
        </button>
      </div>
    </article>
  );
}

function PerformanceChart() {
  return (
    <article className="panel chart-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Performance</p><h2>Community impact</h2></div>
        <button className="period-button">Last 7 days <ChevronDown size={14} /></button>
      </div>
      <div className="chart-legend"><span><i className="legend-lime" />Profile visits</span><span><i className="legend-purple" />New players</span></div>
      <div className="chart-wrap">
        <div className="y-axis"><span>600</span><span>450</span><span>300</span><span>150</span><span>0</span></div>
        <svg viewBox="0 0 640 200" preserveAspectRatio="none" role="img" aria-label="Profile visits and new players increased this week">
          <defs>
            <linearGradient id="areaLime" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00FF87" stopOpacity=".25"/><stop offset="1" stopColor="#00FF87" stopOpacity="0"/></linearGradient>
          </defs>
          <g className="grid-lines"><line x1="0" y1="10" x2="640" y2="10"/><line x1="0" y1="55" x2="640" y2="55"/><line x1="0" y1="100" x2="640" y2="100"/><line x1="0" y1="145" x2="640" y2="145"/><line x1="0" y1="190" x2="640" y2="190"/></g>
          <path className="area-path" d="M0,153 C52,146 77,160 106,141 C151,111 172,126 214,110 C255,95 282,116 320,87 C365,52 393,78 426,62 C480,35 515,54 535,35 C570,3 608,31 640,16 L640,200 L0,200 Z" />
          <path className="line-lime" d="M0,153 C52,146 77,160 106,141 C151,111 172,126 214,110 C255,95 282,116 320,87 C365,52 393,78 426,62 C480,35 515,54 535,35 C570,3 608,31 640,16" />
          <path className="line-purple" d="M0,175 C42,168 72,177 106,163 C142,149 183,160 214,145 C256,125 285,145 320,126 C358,105 389,116 426,105 C472,91 501,101 535,83 C572,63 608,74 640,55" />
          <circle cx="535" cy="35" r="5" fill="#00FF87" stroke="#11140f" strokeWidth="4" />
        </svg>
        <div className="x-axis"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
      </div>
    </article>
  );
}

function ReferralCard({ showLarge = false, onToast }: { showLarge?: boolean; onToast: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    await navigator.clipboard.writeText("https://clutch.best/join/ALEXWINS");
    setCopied(true);
    onToast("Referral link copied to clipboard.");
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <article className={`panel referral-card ${showLarge ? "referral-large" : ""}`}>
      <div className="referral-top"><span className="referral-icon"><Link2 size={18} /></span><span className="live-pill"><i /> Active</span></div>
      <p className="eyebrow">Your referral link</p>
      <h2>Bring your squad</h2>
      <p>Earn 150 points when a referred player completes their first challenge.</p>
      <div className="copy-field"><span>clutch.best/join/<strong>ALEXWINS</strong></span><button onClick={copyLink} aria-label="Copy referral link">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
      <div className="referral-stats">
        <div><strong>47</strong><span>Link clicks</span></div>
        <div><strong>18</strong><span>New players</span></div>
        <div><strong>38%</strong><span>Conversion</span></div>
      </div>
      {showLarge && <div className="share-actions"><button onClick={copyLink}><Copy size={15} /> Copy link</button><button onClick={() => onToast("Share panel ready.")}><Share2 size={15} /> Share</button></div>}
    </article>
  );
}

function TierCard({ points, onRewards }: { points: number; onRewards: () => void }) {
  const progress = Math.min(100, Math.round((points / 5000) * 100));
  return (
    <article className="panel tier-card">
      <div className="tier-glow" />
      <div className="tier-head"><span className="tier-shield"><Crown size={21} /></span><span className="tier-tag">PRO TIER</span></div>
      <p className="eyebrow">Season balance</p>
      <h2>{points.toLocaleString()} <span>pts</span></h2>
      <div className="tier-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="tier-copy"><span>{Math.max(0, 5000 - points).toLocaleString()} pts to Elite</span><strong>{progress}%</strong></div>
      <button onClick={onRewards}>Explore rewards <ArrowRight size={15} /></button>
    </article>
  );
}

function Overview({ points, claimed, loadingId, onClaim, onNavigate, onToast }: { points: number; claimed: Set<string>; loadingId: string | null; onClaim: (mission: Mission) => void; onNavigate: (view: View) => void; onToast: (message: string) => void }) {
  return (
    <>
      <PageHeading eyebrow="Ambassador HQ" title="Good morning, Alex." description="Your community is moving. Here’s where to focus next." action={<button className="primary-button" onClick={() => onNavigate("missions")}><Plus size={16} /> Find a mission</button>} />
      <section className="campaign-banner">
        <div className="campaign-copy">
          <span className="campaign-label"><Sparkles size={13} /> Featured campaign</span>
          <h2>Spring Split: play for the win.</h2>
          <p>Turn rivalry into momentum. Host challenges, share your clips, and climb to Elite before June 30.</p>
          <button onClick={() => onNavigate("missions")}>Explore campaign <ArrowUpRight size={15} /></button>
        </div>
        <div className="campaign-art" aria-hidden="true">
          <span className="orb orb-one"/><span className="orb orb-two"/><span className="slashes">{"///"}</span>
          <div className="campaign-score"><small>SEASON TARGET</small><strong>5,000</strong><span>POINTS</span></div>
        </div>
      </section>
      <section className="stats-grid">
        <StatCard icon={Zap} label="Season points" value={points.toLocaleString()} change="12.4%" detail="vs. last week" tone="lime" />
        <StatCard icon={UserPlus} label="Players referred" value="18" change="20.0%" detail="6 activated this week" tone="violet" />
        <StatCard icon={BarChart3} label="Content reach" value="24.8K" change="8.7%" detail="across 7 posts" tone="cyan" />
        <StatCard icon={Trophy} label="Challenges hosted" value="12" change="2 new" detail="89 total entrants" tone="orange" />
      </section>
      <div className="overview-layout">
        <div className="overview-main">
          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Make your move</p><h2>Your next missions</h2></div><button onClick={() => onNavigate("missions")}>View all <ArrowRight size={15} /></button></div>
            <div className="mission-row">
              {missions.slice(0, 3).map((mission) => <MissionCard key={mission.id} mission={mission} claimed={claimed.has(`mission:${mission.id}`)} loading={loadingId === mission.id} onClaim={onClaim} compact />)}
            </div>
          </section>
          <PerformanceChart />
        </div>
        <aside className="overview-rail">
          <TierCard points={points} onRewards={() => onNavigate("rewards")} />
          <ReferralCard onToast={onToast} />
          <article className="swag-teaser" onClick={() => onNavigate("rewards")}>
            <div className="swag-visual" aria-hidden="true"><Package size={46} /></div>
            <div className="swag-shade" />
            <span className="drop-pill"><Package size={13} /> Limited drop</span>
            <div><p>Elite creator kit</p><h3>Your next unlock.</h3><button>Preview drop <ArrowUpRight size={14} /></button></div>
          </article>
        </aside>
      </div>
    </>
  );
}

function MissionsView({ claimed, loadingId, onClaim }: { claimed: Set<string>; loadingId: string | null; onClaim: (mission: Mission) => void }) {
  const [filter, setFilter] = useState("All");
  const categories = ["All", "Community", "Content", "Competition"];
  const visible = filter === "All" ? missions : missions.filter((mission) => mission.category === filter);
  return (
    <>
      <PageHeading eyebrow="Earn & activate" title="Mission control" description="Choose work that fits your audience. Submit proof, earn points, unlock access." action={<button className="outline-button"><Filter size={15} /> This season <ChevronDown size={14} /></button>} />
      <section className="mission-hero panel">
        <div><span className="campaign-label"><Rocket size={13} /> Boosted this week</span><h2>Lead a Rivalry Night</h2><p>Host a 4-team bracket and give your community a reason to show up. We supply the run-of-show, graphics, and prize support.</p><div className="hero-meta"><span><Zap size={14} /> 600 points</span><span><CalendarDays size={14} /> Ends in 8 days</span><span><Users size={14} /> 22 joined</span></div></div>
        <div className="mission-hero-mark"><Trophy size={54} /></div>
      </section>
      <div className="filter-tabs" role="tablist" aria-label="Mission categories">
        {categories.map((category) => <button role="tab" aria-selected={filter === category} className={filter === category ? "active" : ""} key={category} onClick={() => setFilter(category)}>{category}{category === "All" && <span>{missions.length}</span>}</button>)}
      </div>
      <section className="missions-grid">
        {visible.map((mission) => <MissionCard key={mission.id} mission={mission} claimed={claimed.has(`mission:${mission.id}`)} loading={loadingId === mission.id} onClaim={onClaim} />)}
      </section>
    </>
  );
}

function ContentThumb({ asset }: { asset: ContentAsset }) {
  const Icon = asset.type === "Stream kit" ? MonitorUp : asset.type === "Copy deck" ? FileText : asset.type === "Story pack" ? ImageIcon : Play;
  return <div className={`content-thumb thumb-${asset.tone}`}><span className="thumb-grid"/><Icon size={34}/><strong>{asset.type === "Story pack" ? "9:16" : asset.type === "Post template" ? "1:1" : "CLUTCH"}</strong><i>{"///"}</i></div>;
}

function ContentView({ onToast }: { onToast: (message: string) => void }) {
  const [filter, setFilter] = useState("All assets");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const types = ["All assets", "Post template", "Story pack", "Stream kit", "Copy deck"];
  const visible = filter === "All assets" ? contentAssets : contentAssets.filter((asset) => asset.type === filter);
  const downloadStaticFile = (href: string, fileName: string, message: string) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    anchor.click();
    onToast(message);
  };
  const downloadCompleteKit = () => {
    downloadStaticFile(
      "/kits/clutch-option-a-creator-kit.html",
      "clutch-option-a-creator-kit.html",
      "Creator kit downloaded.",
    );
  };
  const download = (asset: ContentAsset) => {
    if (asset.id === "challenge-launch-pack") {
      downloadStaticFile(
        "/kits/clutch-option-a-social-post.svg",
        "clutch-option-a-social-post.svg",
        "Option A 1080×1080 social graphic downloaded.",
      );
      return;
    }
    const file = new Blob([`${asset.title}\n\n${asset.description}\n\nREADY-TO-POST COPY\n${asset.copy}\n\nBrand note: keep the Clutch mark clear, disclose sponsored activity, and never promise winnings.`], { type: "text/plain" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${asset.id}-creator-notes.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    onToast(`${asset.title} downloaded.`);
  };
  const copy = async (asset: ContentAsset) => {
    await navigator.clipboard.writeText(asset.copy);
    setCopiedId(asset.id);
    onToast("Ready-to-post caption copied.");
    window.setTimeout(() => setCopiedId(null), 1800);
  };
  return (
    <>
      <PageHeading eyebrow="Create faster" title="Content hub" description="On-brand assets, campaign copy, and creator tools—ready when inspiration hits." action={<button className="primary-button" onClick={downloadCompleteKit}><Download size={16} /> Download Option A</button>} />
      <section className="content-feature">
        <div className="feature-art"><span>SPRING</span><strong>PLAY<br/>FOR THE<br/><em>WIN.</em></strong><i>02 — 26</i></div>
        <div className="feature-copy"><span className="campaign-label"><Sparkles size={13} /> Option A · Neon Clash</span><h2>Spring Split launch kit</h2><p>Everything you need to turn this season’s story into content your community wants to join.</p><div className="kit-list"><span><CheckCircle2 size={15}/> Print-ready campaign brief</span><span><CheckCircle2 size={15}/> 1080×1080 social graphic</span><span><CheckCircle2 size={15}/> Caption & disclosure guide</span></div><button onClick={downloadCompleteKit}>Download Option A kit <Download size={15}/></button></div>
      </section>
      <div className="content-toolbar"><div className="filter-tabs">{types.map((type) => <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>{type}</button>)}</div><span>{visible.length} assets</span></div>
      <section className="content-grid">
        {visible.map((asset) => (
          <article className="content-card" key={asset.id}>
            <ContentThumb asset={asset} />
            <div className="content-card-body"><div className="asset-meta"><span>{asset.type}</span><span>{asset.updated}</span></div><h3>{asset.title}</h3><p>{asset.description}</p><small>{asset.format}</small><div className="asset-actions"><button onClick={() => download(asset)}><Download size={15}/> Download</button><button onClick={() => copy(asset)} aria-label={`Copy ${asset.title} caption`}>{copiedId === asset.id ? <Check size={15}/> : <Copy size={15}/>}</button></div></div>
          </article>
        ))}
      </section>
      <section className="content-guidelines panel"><ShieldCheck size={23}/><div><h3>Brand-safe by default</h3><p>Every kit includes placement rules, sponsorship disclosures, responsible-play language, and claims guidance.</p></div><button onClick={() => onToast("Brand guidelines opened.")}>View guidelines <ArrowUpRight size={14}/></button></section>
    </>
  );
}

function ReferralsView({ onToast }: { onToast: (message: string) => void }) {
  const leaders = [
    { rank: 1, name: "JulesK", handle: "@julesclutch", joins: 31, points: "4,650", initials: "JK", color: "orange" },
    { rank: 2, name: "Mina V", handle: "@minav", joins: 24, points: "3,600", initials: "MV", color: "purple" },
    { rank: 3, name: "Alex Morgan", handle: "@alexplays", joins: 18, points: "2,700", initials: "AM", color: "lime" },
    { rank: 4, name: "TheoRush", handle: "@theorush", joins: 16, points: "2,400", initials: "TR", color: "blue" },
  ];
  return (
    <>
      <PageHeading eyebrow="Grow the arena" title="Referral center" description="Track every click, activated player, and point earned from your personal invite." action={<button className="outline-button" onClick={() => onToast("Report export queued.")}><Download size={15}/> Export report</button>} />
      <section className="referral-stat-grid">
        <StatCard icon={Link2} label="Total clicks" value="284" change="16.8%" detail="47 this week" tone="cyan" />
        <StatCard icon={UserPlus} label="Qualified joins" value="68" change="11.5%" detail="24% click-to-join" tone="lime" />
        <StatCard icon={Gamepad2} label="Activated players" value="41" change="9.2%" detail="60% activation rate" tone="violet" />
        <StatCard icon={Zap} label="Points earned" value="6,150" change="900" detail="from referrals" tone="orange" />
      </section>
      <div className="referrals-layout">
        <ReferralCard showLarge onToast={onToast} />
        <article className="panel conversion-panel"><div className="panel-heading"><div><p className="eyebrow">Conversion funnel</p><h2>From click to competitor</h2></div><span className="live-pill"><i/> Live</span></div><div className="funnel"><div><span style={{width:"100%"}}/><strong>284</strong><small>Link clicks</small></div><div><span style={{width:"72%"}}/><strong>68</strong><small>Signed up · 24%</small></div><div><span style={{width:"48%"}}/><strong>41</strong><small>First challenge · 60%</small></div><div><span style={{width:"28%"}}/><strong>29</strong><small>7-day retained · 71%</small></div></div></article>
      </div>
      <article className="panel leaderboard"><div className="panel-heading"><div><p className="eyebrow">Community benchmark</p><h2>Referral leaderboard</h2></div><button className="period-button">This season <ChevronDown size={14}/></button></div><div className="leader-table"><div className="leader-row leader-head"><span>Rank</span><span>Ambassador</span><span>Qualified joins</span><span>Points earned</span></div>{leaders.map((leader) => <div className={`leader-row ${leader.rank === 3 ? "is-you" : ""}`} key={leader.rank}><span className="rank">{leader.rank <= 3 ? <Trophy size={16}/> : `#${leader.rank}`}</span><span className="leader-person"><MiniAvatar initials={leader.initials} color={leader.color}/><span><strong>{leader.name}{leader.rank === 3 && <em>You</em>}</strong><small>{leader.handle}</small></span></span><strong>{leader.joins}</strong><span className="leader-points"><Zap size={13}/> {leader.points}</span></div>)}</div></article>
    </>
  );
}

function RewardsView({ points, claimed, loadingId, onRedeem }: { points: number; claimed: Set<string>; loadingId: string | null; onRedeem: (id: string) => void }) {
  const [filter, setFilter] = useState("All rewards");
  const visible = filter === "All rewards" ? rewards : rewards.filter((reward) => reward.kind === filter.toLowerCase());
  return (
    <>
      <PageHeading eyebrow="Points become perks" title="Rewards & swag" description="Redeem what you’ve earned or keep climbing for experiences money can’t buy." action={<div className="points-balance"><Zap size={17} fill="currentColor"/><span><small>Available balance</small><strong>{points.toLocaleString()} pts</strong></span></div>} />
      <section className="rewards-hero">
        <div className="rewards-hero-visual" aria-hidden="true"><Gift size={116} /></div>
        <div className="rewards-overlay" />
        <div className="reward-hero-copy"><span className="drop-pill"><Crown size={13}/> Elite exclusive</span><h2>The Creator Drop</h2><p>Built for the people building the arena. Heavyweight apparel, event essentials, and a numbered founder card.</p><div><strong>5,000 <small>PTS</small></strong><button disabled={points < 5000} onClick={() => onRedeem("creator-drop")}>{points < 5000 ? <><LockKeyhole size={15}/> {5000 - points} points to unlock</> : <>Claim the drop <ArrowRight size={15}/></>}</button></div></div>
      </section>
      <div className="rewards-bar"><div className="filter-tabs">{["All rewards", "Swag", "Digital", "Experience"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>New drops every month</span></div>
      <section className="rewards-grid">
        {visible.map((reward, index) => {
          const isClaimed = claimed.has(`reward:${reward.id}`);
          const canAfford = points >= reward.points;
          return <article className="reward-card" key={reward.id}><div className={`reward-object object-${index % 4}`}>{reward.kind === "swag" ? <Package size={38}/> : reward.kind === "digital" ? <Rocket size={38}/> : <MessageSquareText size={38}/>}<span className="object-ring"/></div><div className="reward-meta"><span>{reward.tier} · {reward.kind}</span><span>{reward.stock}</span></div><h3>{reward.name}</h3><p>{reward.description}</p><div className="reward-footer"><strong><Zap size={14} fill="currentColor"/> {reward.points.toLocaleString()}</strong><button disabled={!canAfford || isClaimed || loadingId === reward.id} className={isClaimed ? "claimed" : ""} onClick={() => onRedeem(reward.id)}>{loadingId === reward.id ? <LoaderCircle size={15} className="spin"/> : isClaimed ? <><Check size={14}/> Claimed</> : canAfford ? "Redeem" : <><LockKeyhole size={13}/> Locked</>}</button></div></article>;
        })}
      </section>
    </>
  );
}

function PlaybookView({ onApply }: { onApply: () => void }) {
  return (
    <>
      <PageHeading eyebrow="Operator toolkit" title="Build a program that compounds" description="The structure, economics, and guardrails for turning trusted players into a measurable growth channel." action={<button className="primary-button" onClick={onApply}><UserPlus size={16}/> Open applications</button>} />
      <section className="playbook-hero"><div><span className="campaign-label"><Rocket size={13}/> 30-day launch plan</span><h2>Start small. Make contribution visible. Reward what matters.</h2><p>The strongest gaming ambassadors create belonging—not just impressions. Build your pilot around actions that move players from audience to active competitor.</p><div className="playbook-actions"><button onClick={() => document.getElementById("launch-plan")?.scrollIntoView({ behavior: "smooth" })}>View launch plan <ArrowRight size={15}/></button><button onClick={onApply}>Preview application</button></div></div><div className="playbook-symbol"><span>4</span><small>WEEKS TO<br/>FIRST SIGNAL</small></div></section>
      <div className="playbook-layout" id="launch-plan">
        <article className="panel launch-panel"><div className="panel-heading"><div><p className="eyebrow">Execution plan</p><h2>Your first 30 days</h2></div><span className="completion-ring">62%</span></div><div className="launch-list">{launchSteps.map((step, index) => <div className="launch-step" key={step.title}><span className={step.status === "Complete" ? "done" : step.status === "In progress" ? "current" : ""}>{step.status === "Complete" ? <Check size={16}/> : index + 1}</span><div><h3>{step.title}</h3><p>{step.detail}</p><small className={step.status.toLowerCase().replace(" ", "-")}>{step.status}</small></div></div>)}</div></article>
        <article className="panel principles-panel"><p className="eyebrow">Program principles</p><h2>What to reward</h2><div className="principle"><span><Users size={19}/></span><div><h3>Qualified participation</h3><p>First challenges and retained players beat raw registrations.</p></div></div><div className="principle"><span><Trophy size={19}/></span><div><h3>Community moments</h3><p>Reward hosts who turn a game into a recurring ritual.</p></div></div><div className="principle"><span><MessageSquareText size={19}/></span><div><h3>Useful creator signal</h3><p>Prioritize explainers, proof, and player feedback over post volume.</p></div></div></article>
      </div>
      <article className="panel tier-table"><div className="panel-heading"><div><p className="eyebrow">Progression model</p><h2>Four tiers, clear value</h2></div><span>Recommended framework</span></div><div className="tier-table-grid">{tiers.map((tier, index) => <div key={tier.name}><span className={`tier-number tier-number-${index}`}>{index === 3 ? <Crown size={19}/> : String(index + 1).padStart(2, "0")}</span><h3>{tier.name}</h3><strong>{tier.threshold.toLocaleString()}+ pts</strong><p>{tier.benefit}</p></div>)}</div></article>
      <section className="guardrails-grid"><article className="panel"><ShieldCheck size={22}/><h3>Trust & compliance</h3><p>Require clear sponsorship disclosure, age eligibility, responsible-play copy, and proof for every paid action.</p><a href="#launch-plan">View checklist <ArrowRight size={14}/></a></article><article className="panel"><BarChart3 size={22}/><h3>Metrics that matter</h3><p>Track activation rate, cost per qualified player, 30-day retention, hosted entrants, and content-assisted joins.</p><a href="#launch-plan">See scorecard <ArrowRight size={14}/></a></article><article className="panel"><Gift size={22}/><h3>Reward mix</h3><p>Blend status, access, useful swag, platform visibility, experiences, and performance-based cash.</p><a href="#launch-plan">Review economics <ArrowRight size={14}/></a></article></section>
    </>
  );
}

function ApplicationModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: (message: string) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/ambassador/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
    const result = await response.json() as { error?: string; message?: string };
    setSubmitting(false);
    if (!response.ok) { setError(result.error ?? "Could not send application."); return; }
    onSuccess(result.message ?? "Application received.");
    onClose();
  };
  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="application-title"><button className="modal-backdrop" onClick={onClose} aria-label="Close application"/><div className="application-modal"><div className="modal-top"><div><p className="eyebrow green">Join the roster</p><h2 id="application-title">Ambassador application</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><p className="modal-intro">We’re looking for credible community builders—not follower counts. Tell us how you bring players together.</p><form onSubmit={submit}><div className="field-row"><label>Full name<input name="name" required placeholder="Jordan Lee"/></label><label>Email<input name="email" type="email" required placeholder="jordan@example.com"/></label></div><div className="field-row"><label>Creator handle<input name="handle" required placeholder="@yourhandle"/></label><label>Primary platform<select name="primaryPlatform" required defaultValue=""><option value="" disabled>Select platform</option><option>Twitch</option><option>YouTube</option><option>TikTok</option><option>Discord</option><option>Instagram</option><option>Other</option></select></label></div><label>Community size<select name="audienceSize" required defaultValue=""><option value="" disabled>Select range</option><option>Under 1,000</option><option>1,000–5,000</option><option>5,000–25,000</option><option>25,000–100,000</option><option>100,000+</option></select></label><label>How do you activate your gaming community?<textarea name="motivation" required minLength={20} rows={4} placeholder="Tell us about the challenges, streams, events, or communities you run…"/></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? <><LoaderCircle size={15} className="spin"/> Sending…</> : <>Send application <Send size={15}/></>}</button></div></form></div></div>
  );
}

function RoomCard({ room, copied, onCopy, onManage }: { room: Room; copied: boolean; onCopy: () => void; onManage: () => void }) {
  const fill = Math.min(100, Math.round((room.members / room.capacity) * 100));
  const shown = room.roster.slice(0, 4);
  const extra = room.members - shown.length;
  return (
    <article className={`room-card ${toneStyles[room.tone]}`}>
      <div className="room-card-top">
        <span className="room-visual"><Gamepad2 size={19} /></span>
        <span className={`room-status ${room.status.toLowerCase()}`}><i /> {room.status}</span>
      </div>
      <h3>{room.name}</h3>
      <div className="room-meta"><span>{room.game}</span><span aria-hidden="true">·</span><span>{room.visibility}</span></div>
      <p>{room.description}</p>
      <div className="room-members">
        <div className="avatar-stack">
          {shown.map((member, index) => <span key={member.handle} className={`mini-avatar avatar-${member.color}`} style={index ? { marginLeft: -9 } : undefined}>{member.initials}</span>)}
          {extra > 0 && <span className="avatar-more">+{extra}</span>}
        </div>
        <span className="room-count">{room.members}/{room.capacity}</span>
      </div>
      <div className="room-fill"><span style={{ width: `${fill}%` }} /></div>
      <div className="room-schedule"><Clock3 size={13} /> {room.schedule}</div>
      <div className="room-actions">
        <button className="room-manage" onClick={onManage}><ShieldCheck size={14} /> Manage room</button>
        <button className="room-copy" onClick={onCopy} aria-label={`Copy invite for ${room.name}`}>{copied ? <Check size={15} /> : <Link2 size={15} />}</button>
      </div>
    </article>
  );
}

function CreateRoomModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (room: Room) => void }) {
  const [error, setError] = useState("");
  if (!open) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 3) { setError("Give your room a name (at least 3 characters)."); return; }
    const capacityValue = Number(form.get("capacity"));
    const tones: Room["tone"][] = ["lime", "violet", "cyan", "orange"];
    onCreate({
      id: `room-${Date.now()}`,
      name,
      game: String(form.get("game") ?? games[0]),
      status: "Draft",
      visibility: (form.get("visibility") === "Invite only" ? "Invite only" : "Public"),
      members: 0,
      capacity: Number.isFinite(capacityValue) && capacityValue > 1 ? Math.min(500, Math.round(capacityValue)) : 64,
      tone: tones[Math.floor(Math.random() * tones.length)],
      invite: name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "ROOM",
      schedule: "Not scheduled",
      description: String(form.get("description") ?? "").trim() || "New community room.",
      roster: [{ initials: "AM", name: "Alex Morgan", handle: "@alexplays", role: "Host", color: "lime" }],
    });
  };
  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="create-room-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close create room" />
      <div className="application-modal">
        <div className="modal-top"><div><p className="eyebrow green">New lobby</p><h2 id="create-room-title">Create a room</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
        <p className="modal-intro">Spin up a challenge lobby for your community. You stay the host—change anything later.</p>
        <form onSubmit={submit}>
          <label>Room name<input name="name" required placeholder="Friday Night Showdown" /></label>
          <div className="field-row">
            <label>Game<select name="game" defaultValue={games[0]}>{games.map((game) => <option key={game}>{game}</option>)}</select></label>
            <label>Visibility<select name="visibility" defaultValue="Public"><option>Public</option><option>Invite only</option></select></label>
          </div>
          <label>Player capacity<input name="capacity" type="number" min={2} max={500} defaultValue={64} /></label>
          <label>Description<textarea name="description" rows={3} placeholder="What happens in this room?" /></label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button"><Plus size={15} /> Create room</button></div>
        </form>
      </div>
    </div>
  );
}

function ManageRoomModal({ room, onClose, onUpdate, onArchive, onCopy, onToast }: { room: Room | null; onClose: () => void; onUpdate: (id: string, patch: Partial<Room>) => void; onArchive: (id: string) => void; onCopy: (room: Room) => void; onToast: (message: string) => void }) {
  if (!room) return null;
  const cycleStatus = () => {
    const order: RoomStatus[] = ["Draft", "Scheduled", "Live"];
    const next = order[(order.indexOf(room.status) + 1) % order.length];
    onUpdate(room.id, { status: next });
    onToast(`Room set to ${next}.`);
  };
  const toggleVisibility = () => onUpdate(room.id, { visibility: room.visibility === "Public" ? "Invite only" : "Public" });
  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="manage-room-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close room settings" />
      <div className="application-modal room-manage-modal">
        <div className="modal-top"><div><p className="eyebrow green">{room.game} · {room.members} members</p><h2 id="manage-room-title">{room.name}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
        <div className="room-invite-row"><span>clutch.best/room/<strong>{room.invite}</strong></span><button onClick={() => onCopy(room)} aria-label="Copy invite link"><Copy size={15} /></button></div>
        <div className="room-settings">
          <button className="room-setting" onClick={cycleStatus}><span><Play size={15} /> Status</span><em className={`room-status ${room.status.toLowerCase()}`}><i /> {room.status}</em></button>
          <button className="room-setting" onClick={toggleVisibility}><span><LockKeyhole size={15} /> Visibility</span><em>{room.visibility}</em></button>
        </div>
        <div className="room-roster">
          <p className="eyebrow">Members · {room.roster.length} shown</p>
          {room.roster.map((member) => (
            <div className="roster-row" key={member.handle}>
              <MiniAvatar initials={member.initials} color={member.color} />
              <span><strong>{member.name}</strong><small>{member.handle}</small></span>
              <em className={`role-tag role-${member.role.toLowerCase()}`}>{member.role}</em>
            </div>
          ))}
        </div>
        <div className="modal-actions room-danger">
          <button type="button" className="danger-button" onClick={() => onArchive(room.id)}>Archive room</button>
          <button className="primary-button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function RoomsView({ onToast }: { onToast: (message: string) => void }) {
  const [roomList, setRoomList] = useState<Room[]>(rooms);
  const [filter, setFilter] = useState<"All" | RoomStatus>("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visible = filter === "All" ? roomList : roomList.filter((room) => room.status === filter);
  const activeRooms = roomList.filter((room) => room.status !== "Draft").length;
  const totalMembers = roomList.reduce((sum, room) => sum + room.members, 0);
  const liveNow = roomList.filter((room) => room.status === "Live").length;
  const manageRoom = roomList.find((room) => room.id === manageId) ?? null;

  const copyInvite = async (room: Room) => {
    await navigator.clipboard.writeText(`https://clutch.best/room/${room.invite}`);
    setCopiedId(room.id);
    onToast("Room invite link copied.");
    window.setTimeout(() => setCopiedId(null), 1800);
  };
  const createRoom = (room: Room) => {
    setRoomList((current) => [room, ...current]);
    setCreateOpen(false);
    onToast(`Room “${room.name}” created.`);
  };
  const updateRoom = (id: string, patch: Partial<Room>) => setRoomList((current) => current.map((room) => (room.id === id ? { ...room, ...patch } : room)));
  const archiveRoom = (id: string) => { setRoomList((current) => current.filter((room) => room.id !== id)); setManageId(null); onToast("Room archived."); };

  return (
    <>
      <PageHeading eyebrow="Run your community" title="Rooms admin" description="Spin up challenge lobbies, invite your players, and moderate every room yourself." action={<button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} /> Create room</button>} />
      <section className="stats-grid">
        <StatCard icon={Gamepad2} label="Active rooms" value={String(activeRooms)} change={`${liveNow} live`} detail="you host" tone="lime" />
        <StatCard icon={Users} label="Total members" value={totalMembers.toLocaleString()} change="+12 this week" detail="across your rooms" tone="violet" />
        <StatCard icon={Play} label="Live now" value={String(liveNow)} change="peak night" detail="match lobbies open" tone="cyan" />
        <StatCard icon={UserPlus} label="Invites sent" value="63" change="18 joined" detail="this season" tone="orange" />
      </section>
      <div className="content-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Room status">
          {(["All", "Live", "Scheduled", "Draft"] as const).map((option) => <button role="tab" aria-selected={filter === option} key={option} className={filter === option ? "active" : ""} onClick={() => setFilter(option)}>{option}</button>)}
        </div>
        <span>{visible.length} rooms</span>
      </div>
      <section className="rooms-grid">
        {visible.map((room) => <RoomCard key={room.id} room={room} copied={copiedId === room.id} onCopy={() => copyInvite(room)} onManage={() => setManageId(room.id)} />)}
        <button className="room-create-card" onClick={() => setCreateOpen(true)}><span><Plus size={22} /></span><strong>New room</strong><small>Launch a lobby in under a minute</small></button>
      </section>
      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createRoom} />
      <ManageRoomModal room={manageRoom} onClose={() => setManageId(null)} onUpdate={updateRoom} onArchive={archiveRoom} onCopy={copyInvite} onToast={onToast} />
    </>
  );
}

export default function AmbassadorDashboard() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [points, setPoints] = useState(startingPoints);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [search, setSearch] = useState("");

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    // Activity persistence is optional: when the backend/DB isn't configured we
    // stay in demo mode on the seeded state rather than alarming the user.
    fetch("/api/ambassador/activity")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { activities: Activity[]; points: number }) => {
        setActivities(data.activities);
        setPoints(data.points);
      })
      .catch(() => {
        /* no backend yet — keep the seeded demo state, no error toast */
      });
  }, []);

  const claimed = useMemo(() => new Set(activities.map((item) => `${item.actionType}:${item.actionId}`)), [activities]);
  const submitAction = async (actionType: "mission" | "reward", actionId: string) => {
    setLoadingId(actionId);
    try {
      const response = await fetch("/api/ambassador/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionType, actionId }) });
      const result = await response.json() as { activity?: Activity; points?: number; message?: string; error?: string };
      if (!response.ok || !result.activity || typeof result.points !== "number") { showToast(result.error ?? "Action could not be completed.", "error"); return; }
      setActivities((current) => [result.activity as Activity, ...current]);
      setPoints(result.points);
      showToast(result.message ?? "Saved successfully.");
    } catch { showToast("Check your connection and try again.", "error"); }
    finally { setLoadingId(null); }
  };
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    const query = value.trim().toLowerCase();
    if (!query) return;
    if (missions.some((mission) => `${mission.title} ${mission.description}`.toLowerCase().includes(query))) setActiveView("missions");
    else if (contentAssets.some((asset) => `${asset.title} ${asset.description}`.toLowerCase().includes(query))) setActiveView("content");
    else if (rewards.some((reward) => `${reward.name} ${reward.description}`.toLowerCase().includes(query))) setActiveView("rewards");
  }, []);

  return (
    <div className="app-shell">
      <Sidebar active={activeView} onNavigate={setActiveView} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
      <main className="main-shell">
        <Topbar onMenu={() => setMobileOpen(true)} onApply={() => setApplyOpen(true)} search={search} setSearch={handleSearch} />
        <div className="page-content">
          {activeView === "overview" && <Overview points={points} claimed={claimed} loadingId={loadingId} onClaim={(mission) => submitAction("mission", mission.id)} onNavigate={setActiveView} onToast={showToast} />}
          {activeView === "missions" && <MissionsView claimed={claimed} loadingId={loadingId} onClaim={(mission) => submitAction("mission", mission.id)} />}
          {activeView === "content" && <ContentView onToast={showToast} />}
          {activeView === "referrals" && <ReferralsView onToast={showToast} />}
          {activeView === "rooms" && <RoomsView onToast={showToast} />}
          {activeView === "rewards" && <RewardsView points={points} claimed={claimed} loadingId={loadingId} onRedeem={(id) => submitAction("reward", id)} />}
          {activeView === "playbook" && <PlaybookView onApply={() => setApplyOpen(true)} />}
        </div>
      </main>
      <ApplicationModal open={applyOpen} onClose={() => setApplyOpen(false)} onSuccess={showToast} />
      {toast && <div className={`toast ${toast.tone}`} role="status">{toast.tone === "success" ? <CheckCircle2 size={18}/> : <X size={18}/>}<span>{toast.message}</span></div>}
    </div>
  );
}
