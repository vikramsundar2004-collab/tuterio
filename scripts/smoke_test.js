const fs = require("fs");
const path = require("path");

const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";

async function main() {
  const healthRes = await fetch(`${base}/api/health`);
  if (!healthRes.ok) throw new Error("Health endpoint failed");
  const health = await healthRes.json();

  const tutorRes = await fetch(`${base}/api/tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "help", problem: "2x + 3 = 11" }),
  });
  if (!tutorRes.ok) throw new Error("Tutor endpoint failed");

  const interestRes = await fetch(`${base}/api/interest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "smoke@example.com", studentName: "Smoke" }),
  });
  if (!interestRes.ok) throw new Error("Interest endpoint failed");

  const interestFile = path.join(__dirname, "..", "data", "interest-list.json");
  const list = JSON.parse(fs.readFileSync(interestFile, "utf8"));
  const cleaned = list.filter((x) => x.email !== "smoke@example.com");
  fs.writeFileSync(interestFile, JSON.stringify(cleaned, null, 2), "utf8");

  console.log("SMOKE_OK", { model: health.model, hasKey: health.hasKey });
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err.message || err);
  process.exit(1);
});
