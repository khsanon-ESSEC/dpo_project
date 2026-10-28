import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_GOOGLE, debutConnexion, googleActive } from "@/lib/auth/google";
import { suiteValide } from "@/lib/retour";

const versConnexion = (code: string) => NextResponse.redirect(new URL(`/connexion?google=${code}`, process.env.APP_URL || "http://localhost:3000"), 303);

/** « Continuer avec le compte Google » : part vers la page de connexion de Google. */
export async function GET(req: NextRequest) {
  if (!googleActive()) return versConnexion("indisponible");
  try {
    const { url, garde: g } = await debutConnexion();
    // Page où aller une fois connecté (lien d'un courriel) : gardée dans le cookie temporaire, revérifiée au retour.
    const suite = suiteValide(req.nextUrl.searchParams.get("suite"));
    const garde = suite ? { ...g, suite } : g;
    const rep = NextResponse.redirect(url, 303);
    rep.cookies.set(COOKIE_GOOGLE, Buffer.from(JSON.stringify(garde)).toString("base64url"), {
      httpOnly: true,
      secure: process.env.COOKIE_SECURISE !== "0",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    rep.headers.set("cache-control", "no-store");
    return rep;
  } catch (e) {
    console.error("connexion Google :", (e as Error).message);
    return versConnexion("echec");
  }
}
