// Fonction Vercel : transforme un texte en voix. La clé reste ici (variables d'environnement), jamais dans le site.
const hits = new Map();
const MAX = 900;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // GET : le site demande seulement si la voix du serveur est disponible
  if (req.method === "GET") return res.status(200).json({ ok: !!process.env.TTS_API_KEY });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const key = process.env.TTS_API_KEY;
  if (!key) return res.status(503).json({ error: "not configured" });

  // uniquement depuis ton propre site
  const origin = req.headers.origin || "";
  const host = req.headers.host || "";
  if (origin && !origin.endsWith("//" + host)) return res.status(403).json({ error: "origin" });

  // limite simple : 20 demandes par minute et par visiteur
  const ip = String(req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 20) return res.status(429).json({ error: "too many" });
  recent.push(now);
  hits.set(ip, recent);

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const text = String((body && body.text) || "").trim().slice(0, MAX);
  if (!text) return res.status(400).json({ error: "text" });

  const payload = { text, format: "mp3" };
  if (process.env.TTS_REFERENCE_ID) payload.reference_id = process.env.TTS_REFERENCE_ID;

  try {
    const r = await fetch(process.env.TTS_API_URL || "https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        model: process.env.TTS_MODEL || "s2.1-pro-free",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream " + r.status });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: "upstream" });
  }
};
