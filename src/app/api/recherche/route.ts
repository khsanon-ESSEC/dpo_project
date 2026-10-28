import { NextResponse, type NextRequest } from "next/server";
import { utilisateurActif } from "@/lib/auth/session";
import { rechercher } from "@/lib/donnees/recherche";

/** Résultats en direct de la barre (cinq par groupe), selon les droits de la personne connectée. */
export async function GET(req: NextRequest) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
  const r = await rechercher(u, String(req.nextUrl.searchParams.get("q") ?? ""));
  const cinq = <T,>(g: { liste: T[]; total: number }) => ({ liste: g.liste.slice(0, 5), total: g.total });
  return NextResponse.json(r ? { ecrans: cinq(r.ecrans), projets: cinq(r.projets), taches: cinq(r.taches), personnes: cinq(r.personnes) } : null, { headers: { "cache-control": "no-store" } });
}
