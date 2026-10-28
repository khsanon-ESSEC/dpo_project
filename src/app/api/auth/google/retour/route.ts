import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_GOOGLE, finConnexion, googleActive } from "@/lib/auth/google";
import { connecterIdentiteVerifiee } from "@/lib/auth/session";
import { noter } from "@/lib/journal";
import { suiteValide } from "@/lib/retour";

const base = () => process.env.APP_URL || "http://localhost:3000";

/** Retour de Google : vérifie l'état, échange le code, vérifie le jeton, ouvre la session. */
export async function GET(req: NextRequest) {
  const fin = (chemin: string) => {
    const rep = NextResponse.redirect(new URL(chemin, base()), 303);
    // Le cookie temporaire ne sert qu'une fois.
    rep.cookies.set(COOKIE_GOOGLE, "", { httpOnly: true, secure: process.env.COOKIE_SECURISE !== "0", sameSite: "lax", path: "/api/auth/google", maxAge: 0 });
    rep.headers.set("cache-control", "no-store");
    return rep;
  };
  if (!googleActive()) return fin("/connexion?google=indisponible");

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return fin("/connexion?google=annule");
  let garde: { etat?: string; nonce?: string; verificateur?: string; suite?: string } = {};
  try {
    garde = JSON.parse(Buffer.from(req.cookies.get(COOKIE_GOOGLE)?.value ?? "", "base64url").toString("utf8") || "{}");
  } catch {
    garde = {};
  }
  const etat = p.get("state") ?? "";
  const code = p.get("code") ?? "";
  const recu = Buffer.from(etat);
  const attendu = Buffer.from(garde.etat ?? "");
  const memeEtat = attendu.length > 0 && recu.length === attendu.length && timingSafeEqual(recu, attendu);
  if (!memeEtat || !code || !garde.nonce || !garde.verificateur) {
    await noter(null, "connexion_refusee", null, { methode: "google", raison: "etat" });
    return fin("/connexion?google=echec");
  }

  try {
    const r = await finConnexion(code, { nonce: garde.nonce, verificateur: garde.verificateur });
    if (!r.ok) {
      await noter(null, "connexion_refusee", null, { methode: "google", raison: r.refus });
      return fin(`/connexion?google=${r.refus === "domaine" ? "domaine" : "echec"}`);
    }
    const c = await connecterIdentiteVerifiee(r.courriel, "google");
    if (!c.ok) return fin("/connexion?google=sans_acces");
    return fin(suiteValide(garde.suite) ?? "/semaine");
  } catch (e) {
    console.error("connexion Google :", (e as Error).message);
    return fin("/connexion?google=echec");
  }
}
