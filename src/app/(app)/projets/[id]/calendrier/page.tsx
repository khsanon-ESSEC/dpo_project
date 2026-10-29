import type { Metadata } from "next";
import { livrablesDuProjet } from "@/lib/donnees/livrables";
import { ajouterJours, aujourdhui, jourComplet, lundiDe, deMois, moisAnnee, premierDuMois } from "@/lib/dates";
import { Icone } from "@/components/Icone";
import { chargerVueProjet, cheminVue, EnTeteVue, LIBELLE_STATUT } from "../commun";

export const metadata: Metadata = { title: "Calendrier du projet" };

type Element = { id: string; texte: string; titre: string; classe: string; lien: string | null };

export default async function PageCalendrier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mois?: string }> }) {
  const { id } = await params;
  const { mois: m } = await searchParams;
  const ctx = await chargerVueProjet(id);
  const { projet } = ctx;
  const jour = aujourdhui();
  const mois = m && /^\d{4}-\d{2}-01$/.test(m) ? m : premierDuMois(jour);
  const finMois = ajouterJours(premierDuMois(mois, 1), -1);
  const debutGrille = lundiDe(mois);
  const finGrille = ajouterJours(lundiDe(finMois), 6);
  const retour = encodeURIComponent(`${cheminVue(id, "calendrier")}`);
  const base = cheminVue(id, "calendrier");

  // Ce qui tombe chaque jour : les échéances des tâches, les livrables et les jalons du projet.
  const parJour = new Map<string, Element[]>();
  const ajouter = (d: string | null, e: Element) => {
    if (d && d >= debutGrille && d <= finGrille) parJour.set(d, [...(parJour.get(d) ?? []), e]);
  };
  for (const t of ctx.taches) {
    const etat = t.retard ? "en retard" : LIBELLE_STATUT[t.statut].toLowerCase();
    ajouter(t.echeance, {
      id: t.id,
      texte: `${t.initiales} · ${t.titre}`,
      titre: `${t.titre} — ${t.personne} — ${etat}${t.estimationHeures ? ` — ${t.estimationHeures} h` : ""}`,
      classe: t.statut === "faite" ? "puce--faite" : t.statut === "bloquee" ? "puce--bloquee" : t.retard ? "puce--retard" : "",
      lien: t.ouvrable ? `/taches/${t.id}?retour=${retour}` : null,
    });
  }
  // Les livrables, à leur date prévue.
  for (const l of (await livrablesDuProjet(id, jour)).livrables) {
    ajouter(l.prevuLe, {
      id: `livrable-${l.id}`,
      texte: `Livrable · ${l.libelle}`,
      titre: `Livrable « ${l.libelle} »${l.responsable ? ` — ${l.responsable}` : ""} — ${l.affiche === "atteint" ? "validé" : l.affiche === "pret" ? "prêt à valider" : l.enRetard ? "en retard" : `${l.compte.faites}/${l.compte.total} tâches faites`}`,
      classe: `puce--jalon${l.enRetard ? " puce--retard" : ""}`,
      lien: `/projets/${id}#livrable-${l.id}`,
    });
  }
  ajouter(projet.dateFinPrevue, { id: "fin", texte: "Fin prévue du projet", titre: "Fin prévue du projet", classe: "puce--jalon", lien: null });
  ajouter(projet.dateLancementPrevue, { id: "lancement", texte: "Lancement prévu", titre: "Lancement prévu", classe: "puce--jalon", lien: null });

  const jours: string[] = [];
  for (let d = debutGrille; d <= finGrille; d = ajouterJours(d, 1)) jours.push(d);
  const MAX = 4;

  const Puce = ({ e }: { e: Element }) =>
    e.lien ? (
      <a href={e.lien} className={`puce ${e.classe}`} title={e.titre}>
        {e.texte}
      </a>
    ) : (
      <span className={`puce ${e.classe}`} title={e.titre}>
        {e.texte}
      </span>
    );

  const agenda = jours.filter((d) => d >= mois && d <= finMois && parJour.has(d));

  return (
    <>
      <EnTeteVue ctx={ctx} vue="calendrier" />
      <div className="page">
        <div className="ligne-actions">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href={`${base}?mois=${premierDuMois(mois, -1)}`} className="bouton-icone" aria-label="Mois précédent" title="Mois précédent">
              <Icone nom="chevron-gauche" taille={20} />
            </a>
            <h2 style={{ margin: 0, minWidth: 180, textAlign: "center", fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>{moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}</h2>
            <a href={`${base}?mois=${premierDuMois(mois, 1)}`} className="bouton-icone" aria-label="Mois suivant" title="Mois suivant">
              <Icone nom="chevron-droite" taille={20} />
            </a>
            {mois !== premierDuMois(jour) ? (
              <a href={base} className="lien-discret">
                Aujourd&apos;hui
              </a>
            ) : null}
          </div>
          <div className="legende">
            <span>
              <i style={{ width: 3, height: 14, border: 0, background: "var(--arc)" }} /> Échéance
            </span>
            <span>
              <i style={{ width: 3, height: 14, border: 0, background: "var(--retard-point)" }} /> En retard
            </span>
            <span>
              <i style={{ width: 3, height: 14, border: 0, background: "var(--veille-point)" }} /> Bloquée
            </span>
            <span>
              <i style={{ width: 3, height: 14, border: 0, background: "#f4b22d" }} /> Livrable, fin ou lancement
            </span>
          </div>
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
            <p className="vide">Aucune échéance ce mois-ci.</p>
          )}
        </section>
      </div>
    </>
  );
}
