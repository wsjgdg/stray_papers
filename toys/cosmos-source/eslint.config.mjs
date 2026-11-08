import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // The engine uses `any` for Three.js dynamic interop; keep it as a warning
    // so `next build` (which fails on lint errors) stays green while still
    // surfacing the issue. The real type gate is `ignoreBuildErrors: false`.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
