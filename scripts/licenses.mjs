import { readFileSync, writeFileSync } from "node:fs";
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const rows = Object.entries(lock.packages)
  .filter(([name]) => name)
  .map(
    ([name, data]) =>
      `| ${name.replace(/^node_modules\//, "")} | ${data.version ?? ""} | ${data.license ?? "REVIEW REQUIRED"} |`,
  );
writeFileSync(
  "docs/dependency-licenses.md",
  "# Dependency license inventory\n\nGenerated from package-lock.json. Includes transitive and optional packages; licenses do not prove security or provider feasibility.\n\n| Package | Version | License |\n|---|---|---|\n" +
    rows.join("\n") +
    "\n",
);
console.log(`Recorded ${rows.length} package licenses.`);
