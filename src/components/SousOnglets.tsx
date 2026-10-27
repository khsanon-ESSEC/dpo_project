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
];
