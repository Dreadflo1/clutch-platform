import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { APP_URL } from "@/lib/site";

export function BrandMark() {
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

type NavKey = "home" | "duels" | "ambassadors";

/** Shared top navigation. On the home page the section anchors are live. */
export function SiteNav({ active = "home" }: { active?: NavKey }) {
  const onHome = active === "home";
  return (
    <header className="lp-nav">
      <Link className="lp-brand" href="/" aria-label="Clutch home">
        <BrandMark />
        <span className="lp-wordmark">CLUTCH</span>
      </Link>
      <nav className="lp-links" aria-label="Primary">
        <Link href="/duels" aria-current={active === "duels" ? "page" : undefined}>
          Duels
        </Link>
        {onHome ? <a href="#how">How it works</a> : <Link href="/#how">How it works</Link>}
        <Link href="/ambassadors" aria-current={active === "ambassadors" ? "page" : undefined}>
          Ambassadors
        </Link>
      </nav>
      <div className="lp-nav-cta">
        <a className="lp-btn lp-btn-ghost" href={APP_URL}>
          Sign in
        </a>
        <a className="lp-btn lp-btn-neon" href={APP_URL}>
          Enter the arena <ArrowRight size={15} />
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-brand">
        <BrandMark />
        <span className="lp-wordmark">CLUTCH</span>
      </div>
      <p>© 2026 CLUTCH · Peer-to-peer skill contracts · No house edge</p>
      <nav className="lp-footer-links" aria-label="Footer">
        <Link href="/duels">Duels</Link>
        <a href={APP_URL}>Enter the arena</a>
        <Link href="/ambassadors">Ambassadors</Link>
      </nav>
    </footer>
  );
}
