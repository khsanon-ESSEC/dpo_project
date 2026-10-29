import { NextResponse } from "next/server";
import { objectifsDesProjets } from "@/lib/donnees/objectifs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { utilisateurActif } from "@/lib/auth/session";
import { lignesConseil, moisValide } from "@/lib/donnees/conseil";
import { rapportConseilWord } from "@/lib/conseil-word";
import { noter } from "@/lib/journal";

export async function GET(_: Request, { params }: { params: Promise<{ mois: string }> }) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.redirect(new URL("/connexion", process.env.APP_URL || "http://localhost:3000"));
  const a = await acces(u);
  if (!a.toutVoir && !a.directeur) return new NextResponse("Accès refusé", { status: 403 });
  const { mois } = await params;
  if (!moisValide(mois)) return new NextResponse("Mois invalide", { status: 400 });
  const [r] = await db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, mois));
  if (!r) return new NextResponse("Rapport introuvable", { status: 404 });
  const visibles = await idsProjetsVisibles(a);
  const lignes = (await lignesConseil(r.id, r.statut)).filter((l) => visibles === "tous" || visibles.has(l.projet.id));
  const objectifs = await objectifsDesProjets(lignes.map((l) => l.projet.id));
  const fichier = await rapportConseilWord(
    lignes.map(({ ligne, projet }) => ({
      titre: projet.titre,
      description: projet.description,
      programme: projet.programme,
      etatAvancement: ligne.etatAvancement,
      dateEntree: projet.dateEntree,
      dateFinInitiale: projet.dateFinInitiale,
      dateFinDernierRapport: ligne.dateFinDernierRapport,
      nouvelleDateFin: ligne.nouvelleDateFin,
      dateLancement: ligne.dateLancement,
      objectifs: objectifs.get(projet.id),
    })),
  );
  await noter(u.id, "conseil_word", mois);
  return new NextResponse(new Uint8Array(fichier), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="rapport-conseil-${mois.slice(0, 7)}.docx"`,
      "cache-control": "no-store",
    },
  });
}
