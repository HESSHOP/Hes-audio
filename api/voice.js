// Fonction Vercel : clone une voix à partir d'un extrait audio. La clé reste ici (variables d'environnement).
const hits = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ ok: !!process.env.TTS_API_KEY });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const key = process.env.TTS_API_KEY;
  if (!key) return res.status(503).json({ error: "serveur de voix non configuré" });

  // uniquement depuis ton propre site
  const origin = req.headers.origin || "";
  const host = req.headers.host || "";
  if (origin && !origin.endsWith("//" + host)) return res.status(403).json({ error: "origin" });

  // limite : 4 clonages par minute et par visiteur
  const ip = String(req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 4) return res.status(429).json({ error: "trop de demandes" });
  recent.push(now);
  hits.set(ip, recent);

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // le site envoie cet accord seulement si la personne a coché la case
  if (body.consent !== true) return res.status(400).json({ error: "accord de la personne requis" });
  const name = String(body.name || "").trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: "nom manquant" });
  const audio = Buffer.from(String(body.audio || ""), "base64");
  if (audio.length < 20000 || audio.length > 3200000) return res.status(400).json({ error: "extrait trop court ou trop long" });
  if (audio.slice(0, 4).toString() !== "RIFF") return res.status(400).json({ error: "format audio" });

  const base = process.env.TTS_CLONE_URL || "https://api.fish.audio/model";
  const auth = { Authorization: "Bearer " + key };
  try {
    const fd = new FormData();
    fd.append("type", "tts");
    fd.append("title", "hes-" + name);
    fd.append("train_mode", "fast");
    fd.append("visibility", "private");
    fd.append("enhance_audio_quality", "true");
    fd.append("voices", new Blob([audio], { type: "audio/wav" }), "sample.wav");
    const r = await fetch(base, { method: "POST", headers: auth, body: fd });
    if (!r.ok) return res.status(502).json({ error: "fournisseur " + r.status });
    const j = await r.json();
    const id = j._id || j.id;
    if (!id) return res.status(502).json({ error: "réponse invalide" });
    let state = j.state || "created";
    for (let i = 0; i < 3 && state !== "trained" && state !== "failed"; i++) {
      await sleep(1500);
      const g = await fetch(base + "/" + encodeURIComponent(id), { headers: auth });
      if (g.ok) state = (await g.json()).state || state;
    }
    if (state === "failed") return res.status(502).json({ error: "le clonage a échoué" });
    return res.status(200).json({ id, state });
  } catch (e) {
    return res.status(502).json({ error: "fournisseur injoignable" });
  }
};
