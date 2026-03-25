const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /node_modules\/\.pnpm\/pdfkit.*\/pdfkit_tmp.*/,
];

module.exports = config;
