// Renvoie la configuration Firebase lue dans les variables d'environnement Vercel.
// (La clé apiKey d'une application web Firebase n'est pas secrète : la sécurité vient des règles de la base.)
module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
  res.status(200).json({
    apiKey: process.env.FIREBASE_API_KEY || "",
    databaseURL: process.env.FIREBASE_DATABASE_URL || ""
  });
};
