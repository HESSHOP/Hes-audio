// Fonction Vercel : liste les voix de la bibliothèque du service de voix (narrateurs, animés, personnes...).
// La clé reste ici (variables d'environnement), jamais dans le site.
const hits = new Map();

// catégorie du site -> étiquette de la bibliothèque
const CAT = { narrateur: "narration", anime: "anime", personnage: "character", homme: "male", femme: "female", enfant: "child" };
const LANGS = ["fr", "en", "es", "de", "it", "pt", "ja", "ko", "zh", "ar", "ru"];
// on écarte les voix marquées comme venant de personnes célèbres ou réelles connues
const BAD = /celebrit|célébrit|famous|politic|president|présid|footballer|rapper|singer|chanteur|streamer|influenc/i;
const https = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  const key = process.env.TTS_API_KEY;
  if (!key) return res.status(503).json({ error: "serveur de voix non configuré" });

  const origin = req.headers.origin || "";
  const host = req.headers.host || "";
  if (origin && !origin.endsWith("//" + host)) return res.status(403).json({ error: "origin" });

  const ip = String(req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 40) return res.status(429).json({ error: "trop de demandes" });
  recent.push(now);
  hits.set(ip, recent);

  const q = String((req.query && req.query.q) || "").trim().slice(0, 60).replace(/^#/, "");
  const tag = CAT[String((req.query && req.query.cat) || "")] || "";
  const lang = LANGS.includes(String((req.query && req.query.lang) || "")) ? req.query.lang : "";
  const page = Math.min(50, Math.max(1, parseInt(req.query && req.query.page, 10) || 1));

  const url = new URL("https://api.fish.audio/model");
  url.searchParams.set("page_size", "20");
  url.searchParams.set("page_number", String(page));
  url.searchParams.set("sort_by", "task_count");
  if (q) url.searchParams.set("title", q);
  if (tag) url.searchParams.set("tag", tag);
  if (lang) url.searchParams.set("language", lang);

  try {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + key } });
    if (!r.ok) return res.status(502).json({ error: "fournisseur " + r.status, status: r.status });
    const j = await r.json();
    const items = (j.items || [])
      .filter((m) => !BAD.test([m.title, m.description, (m.tags || []).join(" ")].join(" ")))
      .map((m) => {
        const s = Array.isArray(m.samples) && m.samples[0] ? m.samples[0] : {};
        return {
          id: String(m._id || m.id || ""),
          name: String(m.title || "").slice(0, 40),
          desc: String(m.description || "").slice(0, 140),
          cover: https(m.cover_image),
          tags: (Array.isArray(m.tags) ? m.tags : []).slice(0, 6).map(String),
          sample: https(s.audio),
          by: String((m.author && (m.author.nickname || m.author.name)) || "").slice(0, 30),
          likes: Number(m.like_count) || 0,
          uses: Number(m.task_count) || 0,
        };
      })
      .filter((x) => x.id && x.name);
    return res.status(200).json({ items, has_more: !!j.has_more });
  } catch (e) {
    return res.status(502).json({ error: "fournisseur injoignable" });
  }
};
