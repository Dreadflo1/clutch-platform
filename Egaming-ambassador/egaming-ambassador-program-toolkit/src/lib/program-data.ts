export type Mission = {
  id: string;
  category: "Community" | "Content" | "Competition";
  title: string;
  description: string;
  points: number;
  due: string;
  effort: string;
  participants: number;
  tone: "lime" | "violet" | "cyan" | "orange";
  featured?: boolean;
};

export type Reward = {
  id: string;
  name: string;
  description: string;
  points: number;
  stock: string;
  tier: "Core" | "Pro" | "Elite";
  kind: "swag" | "digital" | "experience";
};

export type ContentAsset = {
  id: string;
  type: "Post template" | "Story pack" | "Stream kit" | "Copy deck";
  title: string;
  description: string;
  format: string;
  updated: string;
  tone: "lime" | "purple" | "blue" | "orange";
  copy: string;
};

export const missions: Mission[] = [
  {
    id: "host-weekly-showdown",
    category: "Competition",
    title: "Host a weekly showdown",
    description: "Create a public 1v1 challenge, invite your community, and crown a winner on stream.",
    points: 450,
    due: "Ends in 3 days",
    effort: "45–60 min",
    participants: 38,
    tone: "lime",
    featured: true,
  },
  {
    id: "clip-the-clutch",
    category: "Content",
    title: "Clip the clutch",
    description: "Post your best challenge moment using the season overlay and #PlayForTheWin.",
    points: 250,
    due: "Ends Sunday",
    effort: "15 min",
    participants: 124,
    tone: "violet",
  },
  {
    id: "welcome-three-players",
    category: "Community",
    title: "Welcome 3 new players",
    description: "Help three newcomers set up profiles and enter their first skill-based challenge.",
    points: 300,
    due: "Always on",
    effort: "20 min",
    participants: 76,
    tone: "cyan",
  },
  {
    id: "duo-rivalry-night",
    category: "Competition",
    title: "Run a duo rivalry night",
    description: "Pair community members into four teams and run a bracket using the host toolkit.",
    points: 600,
    due: "Ends in 8 days",
    effort: "90 min",
    participants: 22,
    tone: "orange",
  },
  {
    id: "platform-walkthrough",
    category: "Content",
    title: "Share a platform walkthrough",
    description: "Record a 30–60 second tutorial showing followers how to create a challenge.",
    points: 350,
    due: "Ends in 5 days",
    effort: "30 min",
    participants: 51,
    tone: "cyan",
  },
  {
    id: "community-pulse",
    category: "Community",
    title: "Send the community pulse",
    description: "Collect five pieces of player feedback and share your top insight with the team.",
    points: 200,
    due: "Monthly",
    effort: "15 min",
    participants: 64,
    tone: "violet",
  },
];

export const rewards: Reward[] = [
  {
    id: "founders-pin",
    name: "Founders enamel pin",
    description: "Limited first-season matte black pin with green metalwork.",
    points: 900,
    stock: "42 left",
    tier: "Core",
    kind: "swag",
  },
  {
    id: "arena-cap",
    name: "Arena performance cap",
    description: "Low-profile technical cap, embroidered ambassador mark.",
    points: 1800,
    stock: "18 left",
    tier: "Pro",
    kind: "swag",
  },
  {
    id: "blackout-hoodie",
    name: "Blackout team hoodie",
    description: "Heavyweight 420gsm hoodie from the official team kit.",
    points: 3200,
    stock: "12 left",
    tier: "Pro",
    kind: "swag",
  },
  {
    id: "creator-drop",
    name: "Creator drop box",
    description: "Full hoodie, cap, bottle, lanyard and holographic card set.",
    points: 5000,
    stock: "Unlock at Elite",
    tier: "Elite",
    kind: "swag",
  },
  {
    id: "featured-challenge",
    name: "Featured challenge boost",
    description: "24 hours on the platform homepage for a challenge you host.",
    points: 2400,
    stock: "5 this month",
    tier: "Pro",
    kind: "digital",
  },
  {
    id: "dev-roundtable",
    name: "Developer roundtable",
    description: "Private product session with the game and platform teams.",
    points: 4200,
    stock: "Next: Jun 18",
    tier: "Elite",
    kind: "experience",
  },
];

export const contentAssets: ContentAsset[] = [
  {
    id: "challenge-launch-pack",
    type: "Post template",
    title: "Option A · Challenge launch pack",
    description: "Editable square posts for announcing open challenges and prize pools.",
    format: "HTML kit + SVG graphic",
    updated: "Updated today",
    tone: "lime",
    copy: "Think you can take me? My next challenge is live. Lock in your spot, bring your best, and play for the win. ⚡ #PlayForTheWin",
  },
  {
    id: "matchday-stories",
    type: "Story pack",
    title: "Matchday story set",
    description: "Results, countdown, callout and champion frames for vertical social.",
    format: "12 PNG · 32 MB",
    updated: "Updated 2d ago",
    tone: "purple",
    copy: "Matchday is locked. Who takes the crown? Tap in, pick your rival, and meet us in the arena.",
  },
  {
    id: "spring-stream-kit",
    type: "Stream kit",
    title: "Spring Split stream kit",
    description: "OBS overlays, lower thirds, stingers and a live challenge ticker.",
    format: "ZIP · 84 MB",
    updated: "New this week",
    tone: "blue",
    copy: "LIVE: Spring Split challenge night. Queue up, call your shot, and see if you can beat the room.",
  },
  {
    id: "caption-playbook",
    type: "Copy deck",
    title: "30 ready-to-post captions",
    description: "Hooks, calls to action, disclosures and tags for every campaign moment.",
    format: "DOCX · 220 KB",
    updated: "Updated Friday",
    tone: "orange",
    copy: "The lobby is open. Create your profile, accept your first challenge, and use my invite link to join the squad. #ClutchAmbassador #ad",
  },
];

export const launchSteps = [
  { title: "Define your first cohort", detail: "Start with 15–25 credible community builders across 2–3 priority games.", status: "Complete" },
  { title: "Set mission economics", detail: "Reward measurable actions: verified content, qualified joins, and hosted competitions.", status: "Complete" },
  { title: "Ship the creator kit", detail: "Give ambassadors approved copy, visuals, disclosure rules, and tracking links.", status: "In progress" },
  { title: "Run a 30-day pilot", detail: "Review activation, cost per qualified player, retention, and ambassador feedback weekly.", status: "Up next" },
];

export const tiers = [
  { name: "Rookie", threshold: 0, benefit: "Mission access + community badge" },
  { name: "Core", threshold: 1000, benefit: "Referral bonus + starter swag" },
  { name: "Pro", threshold: 3000, benefit: "Campaign priority + team kit" },
  { name: "Elite", threshold: 5000, benefit: "Revenue share + private experiences" },
];

export const startingPoints = 3180;

export type RoomStatus = "Live" | "Scheduled" | "Draft";
export type RoomMember = { initials: string; name: string; handle: string; role: "Host" | "Mod" | "Player"; color: string };
export type Room = {
  id: string;
  name: string;
  game: string;
  status: RoomStatus;
  visibility: "Public" | "Invite only";
  members: number;
  capacity: number;
  tone: "lime" | "violet" | "cyan" | "orange";
  invite: string;
  schedule: string;
  description: string;
  roster: RoomMember[];
};

export const games = ["Valorant", "League of Legends", "CS2", "Dota 2", "Fortnite", "Apex Legends", "Rocket League", "Overwatch 2"];

export const rooms: Room[] = [
  {
    id: "spring-showdown",
    name: "Spring Showdown Lobby",
    game: "Valorant",
    status: "Live",
    visibility: "Public",
    members: 148,
    capacity: 200,
    tone: "lime",
    invite: "SPRINGVAL",
    schedule: "Live now · match night",
    description: "Open 1v1 challenge lobby for the weekly community showdown. Bring your best aim.",
    roster: [
      { initials: "AM", name: "Alex Morgan", handle: "@alexplays", role: "Host", color: "lime" },
      { initials: "JK", name: "JulesK", handle: "@julesclutch", role: "Mod", color: "orange" },
      { initials: "MV", name: "Mina V", handle: "@minav", role: "Player", color: "purple" },
      { initials: "TR", name: "TheoRush", handle: "@theorush", role: "Player", color: "blue" },
    ],
  },
  {
    id: "ranked-grind",
    name: "Ranked Grind Room",
    game: "League of Legends",
    status: "Scheduled",
    visibility: "Invite only",
    members: 42,
    capacity: 64,
    tone: "violet",
    invite: "GRINDLOL",
    schedule: "Thu 8:00 PM · weekly",
    description: "Invite-only coaching room for the climb to Diamond. Duos welcome, VOD review after.",
    roster: [
      { initials: "AM", name: "Alex Morgan", handle: "@alexplays", role: "Host", color: "lime" },
      { initials: "NS", name: "NovaStriker", handle: "@novastriker", role: "Mod", color: "blue" },
      { initials: "ZX", name: "ZypherX", handle: "@zypherx", role: "Player", color: "orange" },
    ],
  },
  {
    id: "clip-house",
    name: "Clip House",
    game: "CS2",
    status: "Draft",
    visibility: "Public",
    members: 0,
    capacity: 120,
    tone: "cyan",
    invite: "CLIPHOUSE",
    schedule: "Not scheduled",
    description: "Content collab room for editing and sharing the best clutch clips of the week.",
    roster: [
      { initials: "AM", name: "Alex Morgan", handle: "@alexplays", role: "Host", color: "lime" },
    ],
  },
];
