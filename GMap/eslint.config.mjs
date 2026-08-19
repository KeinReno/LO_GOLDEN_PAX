// Minimal, targeted config: catches the exact bug class found 2026-08-17
// (helper called but never imported/defined; variable used before its own
// declaration in the same scope) — no-undef + no-use-before-define.
// Scoped to server/ (.mjs, Node ESM) only for now; client/src is TS/React
// and needs a separate config if wanted later.
export default [
  {
    files: ["server/**/*.mjs"],
    ignores: ["server/**/*.test.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        require: "readonly",
        module: "readonly",
        globalThis: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-use-before-define": [
        "error",
        { functions: false, classes: false, variables: true },
      ],
    },
  },
];
