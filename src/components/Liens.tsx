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
