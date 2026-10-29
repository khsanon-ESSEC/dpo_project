import { ajouterJours, deMois, jourComplet, lundiDe, moisAnnee, premierDuMois } from "@/lib/dates";
import { Icone } from "./Icone";
import { PastilleStatut } from "./PastilleStatut";

/**
 * Un mois en grille (du lundi au dimanche), et sur téléphone la liste des jours qui ont quelque chose. Utilisé par
 * le calendrier d'un projet et par celui de Mes tâches. Une tâche porte sa pastille d'état (`statut`, `retard`).
 */
export type ElementCalendrier = { id: string; texte: string; titre: string; classe: string; lien: string | null; statut?: string; retard?: boolean };

/** La grille d'un mois : premier et dernier jour affichés (semaines entières). */
export function grilleDuMois(mois: string) {
  const finMois = ajouterJours(premierDuMois(mois, 1), -1);
  return { finMois, debutGrille: lundiDe(mois), finGrille: ajouterJours(lundiDe(finMois), 6) };
}

/** Le mois demandé dans l'adresse (« 2026-11-01 »), sinon celui du jour. */
export function moisDemande(m: string | undefined, jour: string): string {
  return m && /^\d{4}-\d{2}-01$/.test(m) ? m : premierDuMois(jour);
}

const MAX = 4;

function Puce({ e }: { e: ElementCalendrier }) {
  const contenu = (
    <>
      {e.statut ? <PastilleStatut statut={e.statut} retard={e.retard} petite /> : null}
      {e.texte}
    </>
  );
  return e.lien ? (
    <a href={e.lien} className={`puce ${e.classe}`} title={e.titre}>
      {contenu}
    </a>
  ) : (
    <span className={`puce ${e.classe}`} title={e.titre}>
      {contenu}
    </span>
  );
}

export function CalendrierMois({
  mois,
  jour,
  lienMois,
  parJour,
  legende,
  vide = "Aucune échéance ce mois-ci.",
}: {
  mois: string;
  jour: string;
  /** Adresse d'un autre mois ; null : le mois en cours. */
  lienMois: (m: string | null) => string;
  parJour: Map<string, ElementCalendrier[]>;
  legende: React.ReactNode;
  vide?: string;
}) {
  const { finMois, debutGrille, finGrille } = grilleDuMois(mois);
  const jours: string[] = [];
  for (let d = debutGrille; d <= finGrille; d = ajouterJours(d, 1)) jours.push(d);
  const agenda = jours.filter((d) => d >= mois && d <= finMois && parJour.has(d));
  return (
    <>
      <div className="ligne-actions">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href={lienMois(premierDuMois(mois, -1))} className="bouton-icone" aria-label="Mois précédent" title="Mois précédent">
            <Icone nom="chevron-gauche" taille={20} />
          </a>
          <h2 style={{ margin: 0, minWidth: 180, textAlign: "center", fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>{moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}</h2>
          <a href={lienMois(premierDuMois(mois, 1))} className="bouton-icone" aria-label="Mois suivant" title="Mois suivant">
            <Icone nom="chevron-droite" taille={20} />
          </a>
          {mois !== premierDuMois(jour) ? (
            <a href={lienMois(null)} className="lien-discret">
              Aujourd&apos;hui
            </a>
          ) : null}
        </div>
        <div className="legende">{legende}</div>
      </div>

      <div className="calendrier" role="grid" aria-label={`Échéances ${deMois(mois)}`}>
        {["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."].map((j) => (
          <div key={j} className="calendrier__tete" role="columnheader">
            {j}
          </div>
        ))}
        {jours.map((d) => {
          const liste = parJour.get(d) ?? [];
          const js = new Date(`${d}T12:00:00Z`).getUTCDay();
          const classes = ["calendrier__jour", js === 0 || js === 6 ? "calendrier__jour--weekend" : "", d < mois || d > finMois ? "calendrier__jour--autre" : "", d === jour ? "calendrier__jour--aujourdhui" : ""].join(" ");
          return (
            <div key={d} className={classes} role="gridcell" aria-label={`${jourComplet(d)}${liste.length ? ` : ${liste.length} élément${liste.length > 1 ? "s" : ""}` : ""}`}>
              <span className="calendrier__num">{Number(d.slice(8))}</span>
              {liste.slice(0, MAX).map((e) => (
                <Puce key={e.id} e={e} />
              ))}
              {liste.length > MAX ? <span className="note">+ {liste.length - MAX} autres</span> : null}
            </div>
          );
        })}
      </div>

      {/* Sur téléphone : la liste des jours qui ont une échéance */}
      <section className="agenda carte carte--liste" aria-label="Échéances du mois">
        {agenda.length ? (
          <ul className="liste">
            {agenda.map((d) => (
              <li key={d} style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                <span className={`carte__titre${d === jour ? " ton-veille" : ""}`} style={{ margin: 0 }}>
                  {jourComplet(d)}
                </span>
                {(parJour.get(d) ?? []).map((e) => (
                  <Puce key={e.id} e={e} />
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="vide">{vide}</p>
        )}
      </section>
    </>
  );
}
