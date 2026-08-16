// Converts the ESM preload output to CommonJS for Electron.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = path.join(__dirname, "..", "dist", "electron", "preload.js");
const dest = path.join(__dirname, "..", "dist", "electron", "preload.cjs");

if (!fs.existsSync(src)) {
  console.error("preload.js not found. Run tsc first.");
  process.exit(1);
}

let code = fs.readFileSync(src, "utf-8");

// Convert ESM imports to CJS requires
code = code.replace(
  /import\s+\{([^}]+)\}\s+from\s+"([^"]+)"/g,
  (_, names, mod) => `const { ${names.trim()} } = require("${mod}")`
);

// Remove export type lines (type-only, not valid in CJS)
code = code.replace(/^export type.*$/gm, "");

fs.writeFileSync(dest, code, "utf-8");
console.log("Created preload.cjs");