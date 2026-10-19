import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Pre-existing app patterns predate these React Compiler rules.
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    // Vendored shadcn/ui components and helpers.
    "components/ui/**",
    "hooks/use-mobile.ts",
    ".next/**",
    "out/**",
    "build/**",
    "android/**",
    "public/sw.js",
    "public/workbox-*.js",
    "public/worker-*.js",
    "next-env.d.ts",
  ]),
])
