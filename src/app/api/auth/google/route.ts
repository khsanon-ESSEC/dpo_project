import { NextResponse } from "next/server";
import { COOKIE_GOOGLE, debutConnexion, googleActive } from "@/lib/auth/google";

const versConnexion = (code: string) => NextResponse.redirect(new URL(`/connexion?google=${code}`, process.env.APP_URL || "http://localhost:3000"), 303);

/** « Continuer avec le compte Google » : part vers la page de connexion de Google. */
export async function GET() {
  if (!googleActive()) return versConnexion("indisponible");
  try {
    const { url, garde } = await debutConnexion();
    const rep = NextResponse.redirect(url, 303);
    rep.cookies.set(COOKIE_GOOGLE, Buffer.from(JSON.stringify(garde)).toString("base64url"), {
      httpOnly: true,
      secure: process.env.COOKIE_SECURISE !== "0",
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: 600,
    });
    rep.headers.set("cache-control", "no-store");
    return rep;
  } catch (e) {
    console.error("connexion Google :", (e as Error).message);
    return versConnexion("echec");
  }
}
