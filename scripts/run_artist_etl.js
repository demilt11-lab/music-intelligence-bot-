// scripts/run_artist_etl.js
/* eslint-disable @typescript-eslint/no-var-requires */
const { spawnSync } = require("node:child_process");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  const [bin, ...args] = cmd.split(" ");
  const result = spawnSync(bin, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.warn(`[WARN] Command exited with code ${result.status}: ${cmd}`);
    return false;
  }
  return true;
}

function main() {
  const dateArg =
    process.argv[2] ||
    new Date().toISOString().slice(0, 10);

  run(`npx tsx jobs/etl/artist_daily_stats.ts ${dateArg}`);
  run(`npx tsx jobs/etl/artist_trajectory_snapshots.ts ${dateArg}`);

  console.log("\n[artist-etl] Done.");
}

if (require.main === module) {
  main();
}
