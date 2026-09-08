const fs = require("fs");
const { Client } = require("pg");

const sql = fs.readFileSync("scratchpad/prod-example-levels.sql", "utf8");
const url = process.env.PROD_DATABASE_URL;
if (!url) { console.error("PROD_DATABASE_URL not set"); process.exit(1); }

async function main() {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  await c.connect();
  const res = await c.query(sql);
  const list = Array.isArray(res) ? res : [res];
  list.forEach((r, i) => {
    if (r.command === "UPDATE") console.log(`\n>>> UPDATE ${r.rowCount} row(s)\n`);
    else if (r.command === "SELECT") {
      console.log(i === 1 ? "BEFORE" : "AFTER");
      for (const row of r.rows) {
        console.log("   ", String(row.slug).padEnd(32), String(row.difficulty).padEnd(9), row.published ? "published" : "draft");
      }
    }
  });
  await c.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
