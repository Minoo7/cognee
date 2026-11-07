import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone: a self-contained server bundle with only the
  // node_modules the app actually reaches. The public repo's Dockerfile copies
  // exactly that path in its runtime stage, so dropping this line does not
  // degrade the image, it fails the build at the COPY. This override replaces
  // the public next.config.ts wholesale, which means anything that file owns
  // and this one omits is not inherited but removed, which is the CLO-703
  // defect one directory above the tree the deletion guard watches.
  output: "standalone",

  // The OSS shell is selected at build time. Backend URLs are resolved at
  // runtime by getLocalApiUrl/getServerBackendUrl, so do not bake in localhost.
  env: {
    NEXT_PUBLIC_IS_CLOUD_ENVIRONMENT:
      process.env.NEXT_PUBLIC_IS_CLOUD_ENVIRONMENT ?? "false",
  },

  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "lh3.googleusercontent.com",
    }],
  },
};

export default nextConfig;
