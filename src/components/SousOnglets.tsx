import { Icone } from "./Icone";

export type SousOnglet = { href: string; libelle: string; icone?: string };

/** Onglets d'une section (équipe, rapports, projet) : chacun mène à une page à part. */
export function SousOnglets({ onglets, courant, label }: { onglets: SousOnglet[]; courant: string; label: string }) {
  return (
    <nav className="vues" aria-label={label}>
      {onglets.map((o) => (
        <a key={o.href} href={o.href} aria-current={o.href === courant ? "page" : undefined}>
          {o.icone ? <Icone nom={o.icone} taille={16} /> : null}
          {o.libelle}
        </a>
      ))}
    </nav>
  );
}

/** Section Équipe : la semaine, l'historique des rapports, la charge de travail. */
export const ONGLETS_EQUIPE: SousOnglet[] = [
  { href: "/equipe", libelle: "Cette semaine", icone: "clients" },
  { href: "/equipe/rapports", libelle: "Rapports", icone: "document" },
  { href: "/charge", libelle: "Charge de travail", icone: "jauge" },
  { href: "/equipe/bilan", libelle: "Bilan", icone: "bilan" },
];

/** Section Semaine : ma semaine (jour par jour), mes réunions, mon bilan, mes tâches à faire. */
export const ONGLETS_SEMAINE: SousOnglet[] = [
  { href: "/semaine", libelle: "Ma semaine", icone: "calendrier" },
  { href: "/reunions", libelle: "Réunions", icone: "reunion" },
  { href: "/bilan", libelle: "Mon bilan", icone: "bilan" },
  { href: "/a-faire", libelle: "À faire", icone: "liste" },
];

/** Section Rapport : le rapport de la semaine et ceux déjà envoyés. */
export const ONGLETS_RAPPORT: SousOnglet[] = [
  { href: "/rapport", libelle: "Cette semaine", icone: "document" },
  { href: "/rapports", libelle: "Mes rapports", icone: "liste" },
];

/** Section Organisation (administrateurs) : les personnes et équipes, les modèles de rapport. */
export const ONGLETS_ORGANISATION: SousOnglet[] = [
  { href: "/organisation", libelle: "Personnes et équipes", icone: "personnes" },
  { href: "/organisation/modeles", libelle: "Modèles de rapport", icone: "modeles" },
  { href: "/organisation/listes", libelle: "Listes", icone: "liste" },
  { href: "/organisation/raci", libelle: "RACI", icone: "colonnes" },
  { href: "/organisation/importer", libelle: "Importer", icone: "importer" },
  { href: "/pilote", libelle: "Suivi du pilote", icone: "bilan" },
];

/**
 * Les onglets d'Organisation que la personne peut ouvrir : tout pour un administrateur ; pour un exécutif qui
 * n'administre pas, les personnes et équipes (en lecture), les listes des projets, le RACI type, l'import des projets et des tâches,
 * et le suivi du pilote.
 */
export function ongletsOrganisation(u: { administrateur: boolean; executif: boolean; externe?: boolean }, toutVoir: boolean): SousOnglet[] {
  if (u.administrateur && !u.externe) return ONGLETS_ORGANISATION;
  return ONGLETS_ORGANISATION.filter((o) => (toutVoir && (o.href === "/organisation" || o.href === "/organisation/listes" || o.href === "/organisation/raci" || o.href === "/organisation/importer")) || (o.href === "/pilote" && u.executif));
}

/** Section Conseil : le rapport mensuel, et les rapports ponctuels faits à tout moment. */
export const ONGLETS_CONSEIL: SousOnglet[] = [
  { href: "/conseil", libelle: "Rapport du mois", icone: "calendrier" },
  { href: "/conseil/ponctuels", libelle: "Rapports ponctuels", icone: "eclair" },
  { href: "/conseil/historique", libelle: "Rapports soumis", icone: "historique" },
  { href: "/conseil/comparer", libelle: "Comparer", icone: "colonnes" },
];
