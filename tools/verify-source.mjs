import fs from "node:fs";
import crypto from "node:crypto";
const m=JSON.parse(fs.readFileSync("SOURCE-MANIFEST.json","utf8"));
for(const f of m.originalFiles){const h=crypto.createHash("sha256").update(fs.readFileSync(f.path)).digest("hex");if(h!==f.sha256)throw new Error("Source mismatch: "+f.path);}
console.log("PASS: "+m.originalFiles.length+" original source/config/asset files match their snapshot.");
