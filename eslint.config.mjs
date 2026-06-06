import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Phase 396 — engine-only enforcement. Components must consume
// FinancialEngine, not the underlying calculator helpers. Whitelist:
// `src/lib/financial-engine.ts`, anything under `tests/` and `e2e/`,
// and other library files that wrap engine math internally.
const FINANCE_HELPERS_OFF_LIMITS = [
  "@/lib/projections",
  "@/lib/credit-card-exposure",
  "@/lib/credit-card-statement",
  "@/lib/cash-flow-bucket",
  "@/lib/financial-snapshot",
  "@/lib/liquidity-curve",
  "@/lib/monthly-obligation-breakdown",
  "@/lib/income-breakdown",
  "@/lib/category-spend",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: FINANCE_HELPERS_OFF_LIMITS.map((name) => ({
            name,
            message:
              "Phase 396 — components must consume FinancialEngine. Import the matching wrapper from @/lib/financial-engine instead of this helper.",
          })),
        },
      ],
    },
  },
]);

export default eslintConfig;
