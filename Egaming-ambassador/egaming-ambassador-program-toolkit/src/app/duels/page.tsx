import type { Metadata } from "next";
import DuelsBoard from "@/components/duels-board";
import { SiteNav, SiteFooter } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Duels — Challenge Board | CLUTCH",
  description:
    "Browse open 1v1 skill challenges on CLUTCH. Match the stake, play the game, and the winner takes the pot — API-verified, non-custodial escrow, no house edge.",
  alternates: { canonical: "/duels" },
  openGraph: {
    title: "CLUTCH Duels — open challenge board",
    description: "Open 1v1 skill challenges. Match the stake, play, winner takes the pot.",
    type: "website",
  },
};

export default function DuelsPage() {
  return (
    <div className="lp">
      <SiteNav active="duels" />
      <main className="lp-main lp-main-board" role="main">
        <DuelsBoard />
      </main>
      <SiteFooter />
    </div>
  );
}
