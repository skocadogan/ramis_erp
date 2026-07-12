import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React 19 + mevcut kod: effect içinde setState (tema, sağlık kontrolü, form reset) yaygın ve geçerli.
      "react-hooks/set-state-in-effect": "off",
      // React Compiler: manuel useCallback ile çıkan gürültü; bağımlılıkları kod incelemesiyle yönetiyoruz.
      "react-hooks/preserve-manual-memoization": "off",
      // TanStack Virtual: useVirtualizer bilinçli kullanım; React Compiler memoize edemez (kütüphane sınırı).
      "react-hooks/incompatible-library": "off",
      // Kademeli sıkılaştırma: any ve tırnak kaçışı uyarı seviyesinde (CI’de --max-warnings ile sınırlandırılabilir).
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
