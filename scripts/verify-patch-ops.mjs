import fs from "node:fs";
import path from "node:path";
import { validatePatchOpsDocument } from "../dist/src/validation/validatePatchOps.js";

const targetDir = process.argv[2] ?? "patches";
const absolute = path.resolve(process.cwd(), targetDir);

async function main() {
  if (!fs.existsSync(absolute)) {
    console.log(`Directory not found: ${absolute}; skipping.`);
    process.exit(0);
  }

  const files = fs.readdirSync(absolute).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log(`No patch JSON files found in ${absolute}; passing.`);
    process.exit(0);
  }

  let failed = 0;

  for (const file of files) {
    const full = path.join(absolute, file);
    const raw = fs.readFileSync(full, "utf8");
    const doc = JSON.parse(raw);
    const result = await validatePatchOpsDocument(doc);

    if (!result.ok) {
      failed += 1;
      console.error(`\n❌ ${file}`);
      for (const e of result.errors) {
        console.error(`   - ${e}`);
      }
    } else {
      console.log(`✅ ${file}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} patch file(s) failed validation.`);
    process.exit(1);
  }

  console.log("\nAll patch files passed.");
}

main().catch((e) => {
  console.error("verify-patch-ops crashed:", e);
  process.exit(2);
});
