import path from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // This app lives in a subdirectory of a repo that has its own lockfile at the
  // root, so pin the workspace root to keep the build deterministic.
  turbopack: {
    root: path.dirname(new URL(import.meta.url).pathname),
  },
}

export default nextConfig
