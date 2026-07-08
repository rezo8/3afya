import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * Shared flat ESLint config for afya packages.
 * Apps extend this in their own eslint.config.js and add env-specific bits.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/.turbo/**", "**/*.gen.ts", "**/routeTree.gen.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
