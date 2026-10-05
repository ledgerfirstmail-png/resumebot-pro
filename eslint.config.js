import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  // `dist` is build output; `src/convex/_generated` is machine-generated
  // (gitignored, recreated by `bunx convex codegen`) — linting it only ever
  // reported "unused eslint-disable" noise (ROADMAP D4).
  { ignores: ["dist", "src/convex/_generated/**"] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // shadcn/ui building blocks export cva variant maps alongside their
    // components by design, and the Vly toolbar is a platform-owned file —
    // the fast-refresh rule only makes noise there. It stays on for app code.
    files: ["src/components/ui/**", "vly-toolbar-readonly.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
