import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This app lives inside the Clutch repo; pin the workspace root so Turbopack
  // does not infer the parent platform directory from its lockfile.
  turbopack: {
    root: path.resolve(),
  },
};

export default nextConfig;
