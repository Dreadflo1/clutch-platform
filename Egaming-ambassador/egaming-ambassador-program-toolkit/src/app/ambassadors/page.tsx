import type { Metadata } from "next";
import AmbassadorDashboard from "@/components/ambassador-dashboard";

export const metadata: Metadata = {
  title: "CLUTCH Ambassador HQ",
  description: "Missions, content, referrals, rooms, and rewards for CLUTCH gaming ambassadors.",
};

export default function AmbassadorsPage() {
  return <AmbassadorDashboard />;
}
