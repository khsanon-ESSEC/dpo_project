import { NextResponse, type NextRequest } from "next/server";
import { acces } from "@/lib/acces";
import { utilisateurActif } from "@/lib/auth/session";
import { disponibilites } from "@/lib/donnees/disponibilites";
import { participantsPourBarre } from "@/lib/donnees/saisie";

/**
 * Avant de noter une réunion : qui est déjà pris à ce créneau ? Seulement pour soi et les personnes qu'on peut
 * inviter (ses contacts, pour une personne hors division).
 */
export async function GET(req: NextRequest) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const permis = new Set((await participantsPourBarre(await acces(u))).map((x) => x.id));
  const ids = String(p.get("ids") ?? "")
    .split(",")
    .filter((id) => permis.has(id))
    .slice(0, 50);
  const r = await disponibilites({ moiId: u.id, personneIds: ids, jour: String(p.get("jour") ?? ""), heure: String(p.get("heure") ?? ""), duree: Number(p.get("duree")), sauf: p.get("sauf") });
  return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
}
