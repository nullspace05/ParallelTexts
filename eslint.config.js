//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "pnpm/json-enforce-catalog": "off",
      "import/consistent-type-specifier-style": "off",
    },
  },
  {
    ignores: [
      "eslint.config.js",
      ".prettierrc",
      ".wrangler/**",
      "worker-configuration.d.ts",
    ],
  },
]
