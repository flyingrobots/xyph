import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadGoldenFixture(): Record<string, unknown> {
  const fixturePath = path.resolve(__dirname, "../../fixtures/valid/minimal-valid.patch.json");
  const raw = fs.readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}
