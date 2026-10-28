import { NextResponse } from "next/server";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { utilisateurActif } from "@/lib/auth/session";
import { dateLongue } from "@/lib/dates";
import { lignesConseil, rapportConseil } from "@/lib/donnees/conseil";
import { rapportConseilWord } from "@/lib/conseil-word";
import { noter } from "@/lib/journal";

/** Fichier Word d'un rapport ponctuel : mêmes colonnes que le rapport mensuel, avec son titre et son objet. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.redirect(new URL("/connexion", process.env.APP_URL || "http://localhost:3000"));
  const a = await acces(u);
  if (!a.toutVoir && !a.directeur) return new NextResponse("Accès refusé", { status: 403 });
  const { id } = await params;
  const r = await rapportConseil(id);
  if (!r || r.genre !== "ponctuel") return new NextResponse("Rapport introuvable", { status: 404 });
  const visibles = await idsProjetsVisibles(a);
  const lignes = (await lignesConseil(r.id, r.statut)).filter((l) => visibles === "tous" || visibles.has(l.projet.id));
  if (!lignes.length && r.creeParId !== u.id) return new NextResponse("Rapport introuvable", { status: 404 });
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
    })),
    {
      ponctuel: {
        titre: r.titre,
        sousTitre: `RAPPORT PONCTUEL DU ${dateLongue(r.dateRapport).toUpperCase()}${r.depuis ? ` · PÉRIODE DEPUIS LE ${dateLongue(r.depuis).toUpperCase()}` : ""}${r.statut === "brouillon" ? " · BROUILLON" : ""}`,
        objet: r.objet,
      },
    },
  );
  await noter(u.id, "conseil_ponctuel_word", r.id);
  const nom = `rapport-ponctuel-${r.dateRapport ?? ""}-${r.titre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.docx`;
  return new NextResponse(new Uint8Array(fichier), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${nom}"`,
      "cache-control": "no-store",
    },
  });
}
