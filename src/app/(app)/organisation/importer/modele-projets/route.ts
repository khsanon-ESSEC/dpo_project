import { NextResponse } from "next/server";
import { acces } from "@/lib/acces";
import { utilisateurActif } from "@/lib/auth/session";
import { peutImporterProjets } from "@/lib/donnees/import-projets";
import { COLONNES_PROJETS } from "@/lib/import-projets";
import { modeleImport } from "../modele-import";

/** Modèle d'import des projets : la feuille à remplir, puis le mode d'emploi (une ligne par colonne, avec un exemple). */
export async function GET() {
  const u = await utilisateurActif();
  if (!u || u.externe || !peutImporterProjets(await acces(u))) return new NextResponse("Introuvable", { status: 404 });
  return modeleImport(COLONNES_PROJETS, "Projets", "modele-import-projets.xlsx");
}
