const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(rawUrl);
} catch {
  console.error("DATABASE_URL is invalid.");
  process.exit(1);
}

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!allowedHosts.has(parsed.hostname)) {
  console.error("Database guard rejected a non-local host.");
  process.exit(1);
}

console.info("Database guard passed for a local host.");
