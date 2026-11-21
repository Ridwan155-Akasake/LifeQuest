// Usage: npm run vapid
// Prints a fresh VAPID key pair for Web Push. Paste both lines into the server's .env.
// Generate ONCE: changing the keys later silently breaks every phone's subscription.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
