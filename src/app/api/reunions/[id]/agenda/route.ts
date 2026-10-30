import { NextResponse, type NextRequest } from "next/server";
import { utilisateurActif } from "@/lib/auth/session";
import { agendaDeReunion } from "@/lib/donnees/agenda";

/** Une réunion (ou, avec ?serie=1, les réunions à venir de sa série) en fichier .ics, pour qui y participe. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
  const { id } = await params;
  const r = await agendaDeReunion(u.id, id, req.nextUrl.searchParams.get("serie") === "1");
  if (!r) return NextResponse.json({ erreur: "Réunion introuvable." }, { status: 404 });
  return new NextResponse(r.fichier, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${r.nom}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
