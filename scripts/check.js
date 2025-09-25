import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const srcDir = join(process.cwd(), "src");
const files = readdirSync(srcDir).filter((file) => file.endsWith(".js"));

for (const file of files) {
  const fullPath = join("src", file);
  const result = spawnSync(process.execPath, ["--check", fullPath], {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

console.log(`Checked ${files.length} files`);
