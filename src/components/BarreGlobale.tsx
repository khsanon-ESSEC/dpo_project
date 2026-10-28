"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { BarreCommande } from "@/components/BarreCommande";

type Donnees = Omit<React.ComponentProps<typeof BarreCommande>, "mode" | "retour" | "initial" | "focus" | "idChamp">;

/**
 * La barre unique, en haut de toutes les pages : chercher, ajouter ou mettre à jour une tâche, noter une
 * réunion, une note pour le rapport, mettre un projet à jour, poser une question. « / » y met le curseur.
 * Sur la page Rechercher, elle reprend la recherche en cours.
 */
export function BarreGlobale(donnees: Donnees) {
  const chemin = usePathname() || "/semaine";
  const params = useSearchParams();
  const q = chemin === "/recherche" ? (params.get("q") ?? "").slice(0, 100) : "";
  return (
    <div className="barre-globale" role="region" aria-label="Barre de commande">
      <div className="barre-globale__corps">
        <BarreCommande key={`${chemin}|${q}`} mode="recherche" retour={chemin} initial={q} focus={chemin === "/recherche" && !q} idChamp="barre-globale" {...donnees} />
      </div>
    </div>
  );
}
