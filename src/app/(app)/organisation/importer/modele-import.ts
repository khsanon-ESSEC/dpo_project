import { NextResponse } from "next/server";
import type { Colonne } from "@/lib/import-projets";
import { ecrireClasseur } from "@/lib/tableur";

/** Un modèle d'import : la feuille à remplir (en-têtes seulement), puis « Mode d'emploi » (colonne, ce qu'on y met, exemple). */
export function modeleImport(colonnes: Colonne[], nom: string, fichier: string) {
  const octets = ecrireClasseur([
    { nom, lignes: [colonnes.map((c) => c.titre)], largeurs: colonnes.map((c) => c.largeur) },
    {
      nom: "Mode d'emploi",
      lignes: [["Colonne", "Ce qu'on y met", "Exemple"], ...colonnes.map((c) => [c.titre, c.aide || "Facultatif.", c.exemple])],
      largeurs: [36, 70, 44],
    },
  ]);
  return new NextResponse(Buffer.from(octets), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fichier}"`,
      "cache-control": "no-store",
    },
  });
}
