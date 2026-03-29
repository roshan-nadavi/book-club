import type { NextConfig } from "next";

// #region agent log
fetch("http://127.0.0.1:7526/ingest/d9d80dac-6ef9-40aa-a30b-e9aa5bc8d838", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": "9b9209",
  },
  body: JSON.stringify({
    sessionId: "9b9209",
    location: "next.config.ts:module",
    message: "next.config module evaluated",
    data: { hypothesisId: "H1", phase: "config-load" },
    timestamp: Date.now(),
    hypothesisId: "H1",
  }),
}).catch(() => {});
// #endregion

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
