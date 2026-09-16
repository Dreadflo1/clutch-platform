import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Gamepad2,
  Lock,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

/** The live Clutch platform (the existing app). Update to your production domain. */
const APP_URL = "https://clutch.best";

const games = [
  "Valorant", "League of Legends", "CS2", "Dota 2", "Fortnite",
  "Apex Legends", "Rocket League", "Overwatch 2", "Clash Royale", "EA FC",
];

const steps = [
  { n: 1, tone: "lime", icon: Wallet, title: "Connect & load CLU", body: "Link your wallet or Telegram and top up CLU tokens. Funds stay in non-custodial escrow — never with us." },
  { n: 2, tone: "violet", icon: Swords, title: "Create the challenge", body: "Pick your game, set the stake and rules, and share a link or QR. Your opponent locks a matching stake." },
  { n: 3, tone: "cyan", icon: ShieldCheck, title: "Play & auto-verify", body: "Play the match. Results verify automatically via Riot / Steam APIs, or by screenshot for other games." },
  { n: 4, tone: "orange", icon: Trophy, title: "Winner takes the pot", body: "The winner is paid instantly — 97.5% of the pot. No house edge, no odds, no random outcomes. Just skill." },
] as const;

function BrandMark() {
  return (
    <span className="lp-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M14.5 17.5 3 6V3h3l11.5 11.5" stroke="#04130a" strokeWidth={2.5} strokeLinecap="round" />
        <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" stroke="#04130a" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" fill="#04130a" opacity={0.3} />
      </svg>
    </span>
  );
}

export default function PlatformLanding() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand"><BrandMark /><span className="lp-wordmark">CLUTCH</span></div>
        <nav className="lp-links" aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#games">Games</a>
          <Link href="/ambassadors">Ambassadors</Link>
        </nav>
        <div className="lp-nav-cta">
          <a className="lp-btn lp-btn-ghost" href={APP_URL}>Sign in</a>
          <a className="lp-btn lp-btn-neon" href={APP_URL}>Enter the arena <ArrowRight size={15} /></a>
        </div>
      </header>

      <main className="lp-main" role="main">
        <section className="lp-hero">
          <div className="lp-hero-grid" aria-hidden="true" />
          <span className="lp-pill"><Zap size={13} fill="currentColor" /> Peer-to-peer · Skill-verified · No house edge</span>
          <h1>Make your friend<br /><em className="lp-green">shut up</em> about their<br /><em className="lp-purple">win streak</em>.</h1>
          <p className="lp-sub">Challenge them head to head with real stakes. You both lock CLU in escrow, play the match, and the winner takes 97.5% of the pot. API-verified for Valorant, LoL and Dota 2.</p>
          <div className="lp-hero-cta">
            <a className="lp-btn lp-btn-neon lp-btn-lg" href={APP_URL}><Swords size={17} /> Start a challenge</a>
            <a className="lp-btn lp-btn-outline lp-btn-lg" href="#how">How it works <ArrowRight size={15} /></a>
          </div>
          <div className="lp-trust">
            <span><BadgeCheck size={15} /> API-verified results</span>
            <span><Lock size={15} /> Non-custodial escrow</span>
            <span><ShieldCheck size={15} /> Integrity scoring</span>
          </div>
        </section>

        <section className="lp-stats">
          <div><strong>97.5%</strong><small>Winner payout</small></div>
          <div><strong>0%</strong><small>House edge</small></div>
          <div><strong>12+</strong><small>Games supported</small></div>
          <div><strong>3</strong><small>Auto-verified titles</small></div>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-section-head">
            <h2>Settle it in <em className="lp-green">four clean moves</em></h2>
            <p>No middlemen. Just you, your rival, and a smart contract that holds both stakes until someone wins.</p>
          </div>
          <div className="lp-steps">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <article className={`lp-step tone-${step.tone}`} key={step.n}>
                  <div className="lp-step-top">
                    <span className="lp-step-icon"><Icon size={22} /></span>
                    <span className="lp-step-num">{step.n}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="lp-section" id="games">
          <div className="lp-section-head">
            <h2>Bring <em className="lp-green">your game</em></h2>
            <p>From tactical shooters to MOBAs to party games — challenge anyone, anywhere.</p>
          </div>
          <div className="lp-games">
            {games.map((game) => <span className="lp-game" key={game}><Gamepad2 size={14} /> {game}</span>)}
          </div>
        </section>

        <section className="lp-ambassador">
          <div className="lp-ambassador-grid" aria-hidden="true" />
          <div className="lp-ambassador-copy">
            <span className="lp-pill"><Users size={13} /> Ambassador program</span>
            <h2>Run your community. Get rewarded.</h2>
            <p>Host challenge nights, grow the arena, and earn points, swag and revenue share — all from a self-serve HQ with missions, content kits, referral tracking and your own rooms.</p>
            <div className="lp-hero-cta">
              <Link className="lp-btn lp-btn-neon lp-btn-lg" href="/ambassadors">Open Ambassador HQ <ArrowUpRight size={16} /></Link>
            </div>
          </div>
          <div className="lp-ambassador-badge" aria-hidden="true"><Trophy size={54} /></div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-brand"><BrandMark /><span className="lp-wordmark">CLUTCH</span></div>
        <p>© 2026 CLUTCH · Peer-to-peer skill contracts · No house edge</p>
        <nav className="lp-footer-links" aria-label="Footer">
          <a href={APP_URL}>Enter the arena</a>
          <Link href="/ambassadors">Ambassadors</Link>
          <a href="#how">How it works</a>
        </nav>
      </footer>
    </div>
  );
}
