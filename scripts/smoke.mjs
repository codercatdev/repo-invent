const base = process.env.BASE || "http://127.0.0.1:8123";
for (const p of ["/", "/app", "/scan", "/api/catalog", "/api/parties"]) {
  const r = await fetch(base + p);
  const body = await r.text();
  const kind = body.includes("view-home")
    ? "APP"
    : body.includes("scan-form")
      ? "SCAN"
      : body.slice(0, 60).replace(/\s+/g, " ");
  console.log(p.padEnd(15), r.status, kind);
}
