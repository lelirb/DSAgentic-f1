#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { evaluate } from "./evaluator/index.js";
import { evaluateUrl } from "./pipeline.js";
import weights from "../config/weights.json" with { type: "json" };
import rules from "../config/rules.json" with { type: "json" };

const args = process.argv.slice(2);
const urlFlagIdx = args.indexOf("--url");

async function main() {
  if (urlFlagIdx !== -1) {
    const url = args[urlFlagIdx + 1];
    if (!url) {
      console.error("Usage: node src/cli.js --url <design-system-url>");
      process.exit(1);
    }
    const { report } = await evaluateUrl(url, { weights, rules });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const path = args[0];
  if (!path) {
    console.error(
      "Usage:\n  node src/cli.js <path-to-normalized-json>\n  node src/cli.js --url <design-system-url>"
    );
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(path, "utf-8"));
  const report = evaluate(input, { weights, rules });
  console.log(JSON.stringify(report, null, 2));
}

main();
