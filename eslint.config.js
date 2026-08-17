import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["public/app.js"],
    languageOptions: {
      parser: undefined,
      parserOptions: undefined,
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        fetch: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "off"
    }
  }
);