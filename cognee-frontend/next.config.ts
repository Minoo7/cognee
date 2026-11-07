import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { webpack, dev }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "react-native$": require.resolve("react-native"),
      "react-native-enriched-markdown$": require.resolve("react-native-enriched-markdown/lib/module/index.web.js"),
    };
    config.plugins.push(new webpack.DefinePlugin({ __DEV__: JSON.stringify(dev) }));
    config.module.rules.push(
      { test: /\.m?js$/, include: /node_modules[/\\]react-native-enriched-markdown[/\\]/, resolve: { fullySpecified: false } },
      { test: /[/\\]wasm[/\\]md4c\.js$/, type: "javascript/auto" },
      { test: /lib[/\\]module[/\\]web[/\\]katex\.js$/, type: "javascript/auto" },
    );
    return config;
  },
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "lh3.googleusercontent.com",
    }],
  },
};

export default nextConfig;
