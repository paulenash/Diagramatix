const fs = require('fs');
const path = require('path');

(async () => {
  try {
    // Compile importVisioV3.ts on the fly via tsx-equivalent: register ts-node
    // OR load the post-build compiled module from .next
    const compiledPath = path.join(__dirname, '..', '.next/server/chunks');
    const files = fs.readdirSync(compiledPath).filter(f => f.includes('importVisioV3') || f.includes('visio-v3'));
    console.log("Found in .next/server/chunks:", files.slice(0, 5));
  } catch (e) {
    console.error("ERROR:", e.message);
  }
})();
