/**
 * seed_keys.js
 * -----------------------------------------------------------
 * Run this ONCE from your own machine to load the 300 keys into
 * Firestore so redeemKey() can validate them.
 *
 * Setup:
 *   1. In the Firebase console: Project settings > Service accounts
 *      > Generate new private key. Save the downloaded file as
 *      scripts/serviceAccountKey.json (this file is gitignored —
 *      never commit it).
 *   2. npm install firebase-admin  (inside /scripts, or reuse /functions' node_modules)
 *   3. node seed_keys.js
 * -----------------------------------------------------------
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const keysPath = path.join(__dirname, "keys_300.txt");
  const keys = fs.readFileSync(keysPath, "utf8").split("\n").map(k => k.trim()).filter(Boolean);

  console.log(`Seeding ${keys.length} keys...`);
  let batch = db.batch();
  let count = 0;

  for (const key of keys) {
    const ref = db.collection("keys").doc(key);
    batch.set(ref, { used: false, usedBy: null, usedAt: null }, { merge: false });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log("Done. All keys seeded as unused.");
}

main().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
