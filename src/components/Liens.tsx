/**
 * Un nom de personne ou de projet, cliquable partout où il apparaît.
 * - Personne : sa fiche (/personnes/…), ouverte à tous pour l'identité ; ses tâches, sa charge et ses
 *   rapports seulement pour qui la suit.
 * - Projet : sa fiche, seulement si le projet est visible pour la personne connectée (sinon, du texte).
 * Ne pas placer dans un autre lien (une rangée cliquable) : un lien ne peut pas en contenir un autre.
 */
import type { ReactNode } from "react";

export function LienPersonne({ id, children, className }: { id: string | null | undefined; children: ReactNode; className?: string }) {
  if (!id) return <>{children}</>;
  return (
    <a href={`/personnes/${id}`} className={`lien-nom ${className ?? ""}`}>
      {children}
    </a>
  );
}

export function LienProjet({ id, visible = true, children, className }: { id: string | null | undefined; visible?: boolean; children: ReactNode; className?: string }) {
  if (!id || !visible) return <>{children}</>;
  return (
    <a href={`/projets/${id}`} className={`lien-nom ${className ?? ""}`}>
      {children}
    </a>
  );
}

/**
 * Le code d'un projet en pastille (« UR »), qui mène à sa fiche quand on la voit. Le titre complet s'affiche
 * au survol et se lit au lecteur d'écran. « mono » : le carré plein des listes de tâches ; sinon l'étiquette fine.
 */
export function CodeProjet({ id, code, titre, visible = true, mono = false, className }: { id: string | null | undefined; code: string; titre?: string | null; visible?: boolean; mono?: boolean; className?: string }) {
  const classe = `${mono ? "mono" : "etiquette-projet"} ${className ?? ""}`;
  // Un projet qu'on ne peut pas ouvrir garde son code, sans titre au survol.
  if (!id || !visible)
    return (
      <span className={classe} title={!id ? (titre ?? undefined) : undefined}>
        {code}
      </span>
    );
  return (
    <a href={`/projets/${id}`} className={`${classe} lien-projet`} title={titre ? `${titre} : ouvrir le projet` : "Ouvrir le projet"} aria-label={titre ? `Projet ${titre}` : `Projet ${code}`}>
      {code}
    </a>
  );
}
