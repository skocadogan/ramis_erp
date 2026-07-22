const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../shared");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot];

// Başlangıç performansı: dinamik require'ları gruplayarak yükler.
config.transformer.inlineRequires = true;

// Bundle boyutunu küçültmek için agresif minification.
config.transformer.minifierConfig = {
  keep_classnames: false,
  keep_fnames: false,
  mangle: {
    toplevel: true,
  },
  compress: {
    drop_console: true,
    passes: 2,
    unsafe: true,
    unsafe_math: true,
  },
};

module.exports = withNativeWind(config, { input: "./global.css" });
