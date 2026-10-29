import { PastilleStatut } from "@/components/PastilleStatut";
import type { Metadata } from "next";
import { aujourdhui, dateCourte, echeanceRelative } from "@/lib/dates";
import { heuresDe, heuresTexte } from "@/lib/charge";
import { chargerVueProjet, cheminVue, EnTeteVue, LIBELLE_STATUT } from "../commun";
import { LienPersonne } from "@/components/Liens";
import { choixDeLivrables } from "@/lib/donnees/livrables";
import { LIBELLE_PRIORITE, priorite, PRIORITES, rangPriorite } from "@/lib/suivi";
import { EtiquettePriorite } from "@/components/EtiquettePriorite";

export const metadata: Metadata = { title: "Tâches du projet" };

const ORDRE = ["en_cours", "a_faire", "bloquee", "faite"] as const;
const TITRE_GROUPE: Record<string, string> = { en_cours: "En cours", a_faire: "À faire", bloquee: "Bloquées", faite: "Faites" };
const TRIS = { echeance: "Échéance", priorite: "Priorité", livrable: "Livrable", personne: "Personne", estimation: "Temps estimé" } as const;

export default async function PageListe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pour?: string; tri?: string; livrable?: string }> }) {
  const { id } = await params;
  const { pour, tri: t0, livrable } = await searchParams;
  const ctx = await chargerVueProjet(id);
  const livrables = (await choixDeLivrables([id]))[id] ?? [];
  const tri = (t0 && t0 in TRIS && (t0 !== "livrable" || livrables.length) ? t0 : "echeance") as keyof typeof TRIS;
  // Filtre « livrable » : un livrable du projet, ou « aucun » (les tâches hors livrable).
  const filtreLivrable = livrable === "aucun" || livrables.some((l) => l.id === livrable) ? livrable : undefined;
  const jour = aujourdhui();
  const base = cheminVue(id, "liste");
  const retour = encodeURIComponent(base);
  const personnes = [...new Map(ctx.taches.map((t) => [t.assigneId, t.personne])).entries()].sort((x, y) => x[1].localeCompare(y[1], "fr"));
  const taches = ctx.taches.filter((t) => (!pour || t.assigneId === pour) && (!filtreLivrable || (filtreLivrable === "aucun" ? !t.livrableId : t.livrableId === filtreLivrable)));
  taches.sort((a, b) =>
    tri === "personne"
      ? a.personne.localeCompare(b.personne, "fr") || (a.echeance ?? "9").localeCompare(b.echeance ?? "9")
      : tri === "estimation"
        ? (b.estimationHeures ?? 0) - (a.estimationHeures ?? 0)
        : tri === "priorite"
          ? rangPriorite(a.priorite) - rangPriorite(b.priorite) || Number(b.retard) - Number(a.retard) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9")
          : Number(b.retard) - Number(a.retard) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9"),
  );
  const ouvertes = taches.filter((t) => t.statut !== "faite");
  // Le tri choisit aussi le regroupement, pour que le changement se voie : par état (échéance),
  // par personne, ou une seule liste du plus long au plus court (temps estimé).
  type Groupe = { cle: string; titre: string; taches: typeof taches };
  const groupes: Groupe[] =
    tri === "livrable"
      ? [...livrables.map((l) => ({ cle: l.id, titre: `Livrable · ${l.libelle}`, taches: taches.filter((t) => t.livrableId === l.id) })), { cle: "aucun", titre: "Hors livrable", taches: taches.filter((t) => !t.livrableId) }]
          .map((g) => ({ ...g, taches: g.taches.sort((a, b) => ORDRE.indexOf(a.statut) - ORDRE.indexOf(b.statut) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9")) }))
          .filter((g) => g.taches.length)
      : tri === "personne"
      ? personnes
          .map(([pid, nom]) => ({
            cle: pid,
            titre: nom,
            taches: taches.filter((t) => t.assigneId === pid).sort((a, b) => ORDRE.indexOf(a.statut) - ORDRE.indexOf(b.statut) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9")),
          }))
          .filter((g) => g.taches.length)
      : tri === "priorite"
      ? [
          ...PRIORITES.map((pr) => ({ cle: pr, titre: `Priorité ${LIBELLE_PRIORITE[pr].toLowerCase()}`, taches: ouvertes.filter((t) => priorite(t.priorite) === pr) })),
          { cle: "faites", titre: "Faites", taches: taches.filter((t) => t.statut === "faite") },
        ].filter((g) => g.taches.length)
      : tri === "estimation"
        ? [
            { cle: "ouvertes", titre: "Tâches ouvertes, de la plus longue à la plus courte", taches: ouvertes },
            { cle: "faites", titre: "Faites", taches: taches.filter((t) => t.statut === "faite") },
          ].filter((g) => g.taches.length)
        : ORDRE.map((statut) => ({ cle: statut, titre: TITRE_GROUPE[statut], taches: taches.filter((t) => t.statut === statut) })).filter((g) => g.taches.length);
  const heures = ouvertes.reduce((s, t) => s + heuresDe(t), 0);
  const lien = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ pour, tri: tri === "echeance" ? undefined : tri, livrable: filtreLivrable, ...q }).filter(([, v]) => v) as [string, string][]);
    const chaine = p.toString();
    return chaine ? `${base}?${chaine}` : base;
  };

  return (
    <>
      <EnTeteVue ctx={ctx} vue="liste">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>tâches ouvertes</dt>
            <dd>{ouvertes.length}</dd>
          </div>
          <div className={`chiffre ${ouvertes.some((t) => t.retard) ? "chiffre--retard" : ""}`}>
            <dt>en retard</dt>
            <dd>{ouvertes.filter((t) => t.retard).length}</dd>
          </div>
          <div className="chiffre">
            <dt>de travail restant (estimé)</dt>
            <dd>
              {Math.round(heures)}
              <small>&nbsp;h</small>
            </dd>
          </div>
        </dl>
      </EnTeteVue>
      <div className="page">
        <div className="ligne-actions">
          <nav className="filtres" aria-label="Filtrer par personne">
            <a className="filtre" href={lien({ pour: undefined })} aria-current={!pour ? "true" : undefined}>
              Toute l&apos;équipe
            </a>
            {personnes.map(([pid, nom]) => (
              <a key={pid} className="filtre" href={lien({ pour: pid })} aria-current={pour === pid ? "true" : undefined}>
                {nom.split(" ")[0]}
              </a>
            ))}
          </nav>
          <nav className="zoom" aria-label="Trier et regrouper par">
            {(Object.keys(TRIS) as (keyof typeof TRIS)[]).filter((k) => k !== "livrable" || livrables.length).map((k) => (
              <a key={k} href={lien({ tri: k === "echeance" ? undefined : k })} aria-current={tri === k ? "true" : undefined}>
                {TRIS[k]}
              </a>
            ))}
          </nav>
        </div>
        {filtreLivrable ? (
          <p className="note" style={{ margin: 0 }}>
            {filtreLivrable === "aucun" ? "Tâches hors livrable" : `Tâches du livrable « ${livrables.find((l) => l.id === filtreLivrable)?.libelle} »`} ·{" "}
            <a href={lien({ livrable: undefined })} className="lien-discret">
              voir toutes les tâches
            </a>
          </p>
        ) : null}
        <section className="carte defile-x" aria-label="Tâches du projet">
          <table className="liste-taches">
            <thead>
              <tr>
                <th scope="col">Tâche</th>
                <th scope="col" aria-sort={tri === "personne" ? "ascending" : undefined}>
                  Personne
                </th>
                <th scope="col" className="facultatif">
                  Début
                </th>
                <th scope="col" aria-sort={tri === "echeance" ? "ascending" : undefined}>
                  Échéance
                </th>
                <th scope="col" className={tri === "estimation" ? "nombre" : "nombre facultatif"} aria-sort={tri === "estimation" ? "descending" : undefined}>
                  Estimé
                </th>
                <th scope="col">État</th>
              </tr>
            </thead>
            {groupes.map(({ cle, titre, taches: groupe }) => {
              return (
                <tbody key={cle}>
                  <tr className="groupe">
                    <th colSpan={6} scope="rowgroup">
                      {titre} · {groupe.length}
                    </th>
                  </tr>
                  {groupe.map((t) => {
                    const e = echeanceRelative(t.echeance, jour);
                    return (
                      <tr key={t.id} style={t.statut === "faite" ? { color: "var(--discret)" } : undefined}>
                        <td>
                          <PastilleStatut statut={t.statut} retard={t.retard} />
                          {t.ouvrable ? (
                            <a href={`/taches/${t.id}?retour=${retour}`} className={t.statut === "faite" ? "titre-faite" : undefined}>
                              {t.titre}
                            </a>
                          ) : (
                            <span className={t.statut === "faite" ? "titre-faite" : undefined}>{t.titre}</span>
                          )}
                          <EtiquettePriorite priorite={t.priorite} faite={t.statut === "faite"} recurrente={!!t.recurrenceId} />
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span className="mono mono--petit" aria-hidden="true">
                              {t.initiales}
                            </span>
                            <LienPersonne id={t.assigneId}>{t.personne}</LienPersonne>
                          </span>
                        </td>
                        <td className="facultatif" style={{ whiteSpace: "nowrap" }}>
                          {t.debut ? dateCourte(t.debut) : "—"}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }} className={t.retard ? "ton-retard" : undefined}>
                          {t.echeance ? (t.statut === "faite" ? dateCourte(t.echeance) : e.texte) : "—"}
                        </td>
                        <td className={tri === "estimation" ? "nombre" : "nombre facultatif"}>{t.estimationHeures ? heuresTexte(t.estimationHeures) : <span className="ton-discret">—</span>}</td>
                        <td style={{ whiteSpace: "nowrap" }} className={t.statut === "bloquee" ? "ton-veille" : t.retard ? "ton-retard" : undefined}>
                          {t.retard ? "En retard" : LIBELLE_STATUT[t.statut]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
          {taches.length === 0 ? <p className="vide">Aucune tâche.</p> : null}
        </section>
      </div>
    </>
  );
}
