import { NextResponse, type NextRequest } from "next/server";
import { utilisateurActif } from "@/lib/auth/session";
import { repondre } from "@/lib/donnees/questions";

/** Une question posée dans la barre : réponse par règles simples, selon les droits de la personne connectée. */
export async function GET(req: NextRequest) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
  return NextResponse.json(await repondre(u, String(req.nextUrl.searchParams.get("q") ?? "")), { headers: { "cache-control": "no-store" } });
}
