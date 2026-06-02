// scripts/run_artist_etl.js
/* eslint-disable @typescript-eslint/no-var-requires */
const { execSync } = require("node:child_process");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  const dateArg =
    process.argv[2] ||
    new Date().toISOString().slice(0, 10);

  run(`npx tsx jobs/etl/artist_daily_stats.ts ${dateArg}`);
  run(`npx tsx jobs/etl/artist_trajectory_snapshots.ts ${dateArg}`);
}

if (require.main === module) {
  main();
}
