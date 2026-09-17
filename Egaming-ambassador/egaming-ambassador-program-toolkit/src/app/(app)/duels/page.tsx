import type { Metadata } from "next";
import DuelsBoard from "@/components/duels-board";

export const metadata: Metadata = {
  title: "Duels — Challenge Board | CLUTCH",
  description:
    "Browse open 1v1 skill challenges on CLUTCH. Match the stake, play the game, and the winner takes the pot — API-verified, non-custodial escrow, no house edge.",
  alternates: { canonical: "/duels" },
};

export default function DuelsPage() {
  return <DuelsBoard />;
}
