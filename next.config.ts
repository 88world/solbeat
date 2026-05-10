import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@solana/web3.js", "@solana/spl-token"],
  // Hide Next.js's dev-mode "N" overlay so it doesn't show up in screenshots
  // / screen recordings during the demo.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.helius-rpc.com" },
      { protocol: "https", hostname: "**.dexscreener.com" },
      { protocol: "https", hostname: "**.birdeye.so" },
      { protocol: "https", hostname: "**.solana.com" },
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "**.ipfs.dweb.link" },
      { protocol: "https", hostname: "arweave.net" },
      { protocol: "https", hostname: "**.arweave.net" },
      { protocol: "https", hostname: "shdw-drive.genesysgo.net" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "image.solscan.io" },
    ],
  },
};

export default nextConfig;
