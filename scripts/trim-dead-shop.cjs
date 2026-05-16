const fs = require("fs");
const p = require("path").join(__dirname, "../src/components/PharmacyPortal.tsx");
let lines = fs.readFileSync(p, "utf8").split("\n");
const out = [];
let skip = false;
for (const line of lines) {
  if (line.includes('{false && patientTab === "shop"')) {
    skip = true;
    continue;
  }
  if (skip && line.includes('{patientTab === "meds" && patientPrescriptions.length === 0')) {
    skip = false;
    out.push(line);
    continue;
  }
  if (!skip) out.push(line);
}
fs.writeFileSync(p, out.join("\n"));
console.log("done");
