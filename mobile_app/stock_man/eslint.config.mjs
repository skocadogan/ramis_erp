import expoFlat from "eslint-config-expo/flat.js";
export default [
  ...expoFlat,
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "android/**",
      "ios/**",
      "coverage/**",
    ],
  },
];
