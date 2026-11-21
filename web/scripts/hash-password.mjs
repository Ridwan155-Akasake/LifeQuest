// Usage: npm run hash-password -- "your password"
// Prints the three OWNER_* env vars for .env / Vercel.
import crypto from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: npm run hash-password -- "your password"');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(pw, salt, 100_000, 64, "sha512");
console.log(`OWNER_PASSWORD_HASH="${hash.toString("hex")}"`);
console.log(`OWNER_PASSWORD_SALT="${salt.toString("hex")}"`);
console.log(`OWNER_SESSION_SECRET="${crypto.randomBytes(32).toString("hex")}"`);
