import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGithubPages ? "/macweb.github.io" : undefined,
  assetPrefix: isGithubPages ? "/macweb.github.io/" : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: isGithubPages ? "/macweb.github.io" : "",
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
