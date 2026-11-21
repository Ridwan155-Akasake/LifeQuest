// HQ ticker: pokes /api/cron/tick every minute so due reminders and the morning digest
// go out. Runs in its own container on the internal Docker network (docker-compose.yml).
// Logs only when something was sent or went wrong, so `docker compose logs ticker` stays readable.

const URL = process.env.TICK_URL || "http://web:3000/api/cron/tick";
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error("CRON_SECRET is not set");
  process.exit(1);
}

async function tick() {
  const at = new Date().toISOString();
  try {
    const res = await fetch(URL, { method: "POST", headers: { "x-cron-secret": SECRET }, signal: AbortSignal.timeout(50_000) });
    const body = await res.text();
    if (!res.ok) return console.error(at, `tick HTTP ${res.status}`, body.slice(0, 200));
    const r = JSON.parse(body);
    if (r.reminders > 0 || r.digest !== "skipped") console.log(at, body);
  } catch (e) {
    console.error(at, "tick failed:", e instanceof Error ? e.message : e);
  }
}

// Align to the top of each minute so a "3:00 PM" reminder fires at 3:00, not 3:00:59.
setTimeout(() => {
  tick();
  setInterval(tick, 60_000);
}, 60_000 - (Date.now() % 60_000));
console.log("ticker started →", URL);
