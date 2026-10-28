// Fournisseur OpenID factice (même protocole que Google) pour essayer la connexion en local.
// ESSAIS SEULEMENT, jamais en production. Lancer : node scripts/essai/google-factice.mjs
// puis démarrer l'application avec GOOGLE_EMETTEUR=http://127.0.0.1:8788 GOOGLE_CLIENT_ID=essai-client
// GOOGLE_CLIENT_SECRET=essai-secret GOOGLE_DOMAINE=demo.dpo.local APP_URL=http://127.0.0.1:3000 COOKIE_SECURISE=0.
// Découverte, page de choix du compte, jeton d'identité signé RS256, clés publiées, PKCE.
import { createServer } from "node:http";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

const BASE = "http://127.0.0.1:8788";
const SECRET = process.env.FAUX_SECRET || "essai-secret";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const kid = randomBytes(8).toString("hex");
const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
const codes = new Map();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (charge) => {
  const tete = b64({ alg: "RS256", typ: "JWT", kid });
  const corps = b64(charge);
  return `${tete}.${corps}.${sign("RSA-SHA256", Buffer.from(`${tete}.${corps}`), privateKey).toString("base64url")}`;
};
const lire = (req) => new Promise((ok) => { let c = ""; req.on("data", (x) => (c += x)); req.on("end", () => ok(c)); });
const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname === "/.well-known/openid-configuration")
    return json(res, 200, { issuer: BASE, authorization_endpoint: `${BASE}/auth`, token_endpoint: `${BASE}/token`, jwks_uri: `${BASE}/certs` });
  if (u.pathname === "/certs") return json(res, 200, { keys: [jwk] });
  if (u.pathname === "/auth" && req.method === "GET") {
    const p = u.searchParams;
    const champs = ["client_id", "redirect_uri", "state", "nonce", "code_challenge"].map((k) => `<input type="hidden" name="${k}" value="${(p.get(k) ?? "").replace(/"/g, "&quot;")}">`).join("");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Compte (factice)</title><form method="post" action="/auth">${champs}<label>Compte <input id="compte" name="email"></label><button id="continuer">Continuer</button><button id="annuler" name="annuler" value="1">Annuler</button></form>`);
  }
  if (u.pathname === "/auth" && req.method === "POST") {
    const f = new URLSearchParams(await lire(req));
    const retour = new URL(f.get("redirect_uri"));
    if (f.get("annuler")) { retour.searchParams.set("error", "access_denied"); retour.searchParams.set("state", f.get("state")); }
    else {
      const code = randomBytes(16).toString("hex");
      codes.set(code, { email: f.get("email"), nonce: f.get("nonce"), client: f.get("client_id"), defi: f.get("code_challenge"), retour: f.get("redirect_uri") });
      retour.searchParams.set("code", code); retour.searchParams.set("state", f.get("state"));
    }
    res.writeHead(302, { location: retour.toString() });
    return res.end();
  }
  if (u.pathname === "/token" && req.method === "POST") {
    const f = new URLSearchParams(await lire(req));
    const c = codes.get(f.get("code"));
    codes.delete(f.get("code"));
    if (!c || f.get("client_secret") !== SECRET || f.get("client_id") !== c.client || f.get("redirect_uri") !== c.retour) return json(res, 400, { error: "invalid_grant" });
    if (createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") !== c.defi) return json(res, 400, { error: "invalid_grant", error_description: "PKCE" });
    const domaine = c.email.split("@")[1];
    const maintenant = Math.floor(Date.now() / 1000);
    const charge = { iss: BASE, aud: c.client, sub: createHash("sha256").update(c.email).digest("hex").slice(0, 21), email: c.email, email_verified: true, nonce: c.nonce, iat: maintenant, exp: maintenant + 3600 };
    if (domaine !== "gmail.com") charge.hd = domaine;
    return json(res, 200, { access_token: "x", token_type: "Bearer", expires_in: 3600, id_token: jwt(charge) });
  }
  res.writeHead(404); res.end();
}).listen(8788, "127.0.0.1", () => console.log("Fournisseur OpenID factice sur 8788"));
