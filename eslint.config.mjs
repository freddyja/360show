import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Booth split: the tablet is a remote surface only (see src/lib/deviceRole.ts).
    files: ["src/app/tablet/**", "src/app/tablet-icon/**", "src/components/screens/TabletOperatorScreen.tsx", "src/components/TabletSettingsPanel.tsx", "src/lib/remote/tabletClient.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/capture/*", "@/lib/hardware/*", "**/capture/*", "**/hardware/*"], message: "Capture/camera code runs only on the booth phone." },
            { group: ["@/lib/music/*", "!@/lib/music/beds"], message: "Music playback/mixing runs only on the booth phone." },
            { group: ["@/lib/store", "@/lib/db", "@/lib/remote/client", "@/components/screens/CaptureScreen", "@/components/RampPlayer", "@/components/FrameOverlay"], message: "Booth-only module; the tablet talks to the phone through /api/remote/* (tabletClient)." },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
