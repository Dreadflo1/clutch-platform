import type { Metadata } from "next";
import PlatformLanding from "@/components/platform-landing";

export const metadata: Metadata = {
  title: "CLUTCH — Challenge Your Friends | P2P Skill-Based Gaming Duels",
  description:
    "Challenge your friends to skill-based gaming duels with real stakes. Peer-to-peer escrow, API-verified results for Valorant, LoL, Dota 2. No house edge — just skill.",
};

export default function HomePage() {
  return <PlatformLanding />;
}
