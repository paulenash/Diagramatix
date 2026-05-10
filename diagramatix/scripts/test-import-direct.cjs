// Test importVisioV3 directly via tsx/ts-node transpilation
const { spawn } = require('child_process');

// Write a temporary tsx-runnable test
const fs = require('fs');
const path = require('path');

const testScript = `
import { importVisioV3 } from "./app/lib/diagram/v3/importVisioV3";
import * as fs from "fs";

const buf = fs.readFileSync("public/Application Process.vsdx");
importVisioV3(buf).then((result) => {
  console.log("ELEMENTS:", result.data.elements.length);
  console.log("CONNECTORS:", result.data.connectors.length);
  console.log("WARNINGS:", result.warnings.length);
  console.log("STATS:", JSON.stringify(result.stats, null, 2));
  if (result.warnings.length) {
    console.log("\nFirst warnings:");
    for (const w of result.warnings.slice(0, 8)) console.log("  ", w);
  }
}).catch((e) => {
  console.error("FAILED:", e.message);
  console.error(e.stack);
});
`;
fs.writeFileSync(path.join(__dirname, '..', '_test_import.ts'), testScript);
const p = spawn('npx', ['tsx', '_test_import.ts'], { cwd: path.join(__dirname, '..'), stdio: 'inherit', shell: true });
p.on('exit', (code) => {
  fs.unlinkSync(path.join(__dirname, '..', '_test_import.ts'));
  process.exit(code);
});
