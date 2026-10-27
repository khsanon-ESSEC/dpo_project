import type { Metadata } from "next";
import { aujourdhui, dateCourte, echeanceRelative } from "@/lib/dates";
import { heuresDe, heuresTexte } from "@/lib/charge";
import { chargerVueProjet, cheminVue, EnTeteVue, LIBELLE_STATUT } from "../commun";

export const metadata: Metadata = { title: "Tâches du projet" };

const ORDRE = ["en_cours", "a_faire", "bloquee", "faite"] as const;
const TITRE_GROUPE: Record<string, string> = { en_cours: "En cours", a_faire: "À faire", bloquee: "Bloquées", faite: "Faites" };
const TRIS = { echeance: "Échéance", personne: "Personne", estimation: "Temps estimé" } as const;

export default async function PageListe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pour?: string; tri?: string }> }) {
  const { id } = await params;
  const { pour, tri: t0 } = await searchParams;
  const tri = (t0 && t0 in TRIS ? t0 : "echeance") as keyof typeof TRIS;
  const ctx = await chargerVueProjet(id);
  const jour = aujourdhui();
  const base = cheminVue(id, "liste");
  const retour = encodeURIComponent(base);
  const personnes = [...new Map(ctx.taches.map((t) => [t.assigneId, t.personne])).entries()].sort((x, y) => x[1].localeCompare(y[1], "fr"));
  const taches = (pour ? ctx.taches.filter((t) => t.assigneId === pour) : ctx.taches).slice();
  taches.sort((a, b) =>
    tri === "personne"
      ? a.personne.localeCompare(b.personne, "fr") || (a.echeance ?? "9").localeCompare(b.echeance ?? "9")
      : tri === "estimation"
        ? (b.estimationHeures ?? 0) - (a.estimationHeures ?? 0)
        : Number(b.retard) - Number(a.retard) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9"),
  );
  const ouvertes = taches.filter((t) => t.statut !== "faite");
  const heures = ouvertes.reduce((s, t) => s + heuresDe(t), 0);
  const lien = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ pour, tri: tri === "echeance" ? undefined : tri, ...q }).filter(([, v]) => v) as [string, string][]);
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
          <nav className="zoom" aria-label="Trier par">
            {(Object.keys(TRIS) as (keyof typeof TRIS)[]).map((k) => (
              <a key={k} href={lien({ tri: k === "echeance" ? undefined : k })} aria-current={tri === k ? "true" : undefined}>
                {TRIS[k]}
              </a>
            ))}
          </nav>
        </div>
        <section className="carte defile-x" aria-label="Tâches du projet">
          <table className="liste-taches">
            <thead>
              <tr>
                <th scope="col">Tâche</th>
                <th scope="col">Personne</th>
                <th scope="col" className="facultatif">
                  Début
                </th>
                <th scope="col">Échéance</th>
                <th scope="col" className="nombre facultatif">
                  Estimé
                </th>
                <th scope="col">État</th>
              </tr>
            </thead>
            {ORDRE.map((statut) => {
              const groupe = taches.filter((t) => t.statut === statut);
              if (!groupe.length) return null;
              return (
                <tbody key={statut}>
                  <tr className="groupe">
                    <th colSpan={6} scope="rowgroup">
                      {TITRE_GROUPE[statut]} · {groupe.length}
                    </th>
                  </tr>
                  {groupe.map((t) => {
                    const e = echeanceRelative(t.echeance, jour);
                    return (
                      <tr key={t.id} style={t.statut === "faite" ? { color: "var(--discret)" } : undefined}>
                        <td>{t.ouvrable ? <a href={`/taches/${t.id}?retour=${retour}`}>{t.titre}</a> : t.titre}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span className="mono mono--petit" aria-hidden="true">
                              {t.initiales}
                            </span>
                            {t.personne}
                          </span>
                        </td>
                        <td className="facultatif" style={{ whiteSpace: "nowrap" }}>
                          {t.debut ? dateCourte(t.debut) : "—"}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }} className={t.retard ? "ton-retard" : undefined}>
                          {t.echeance ? (t.statut === "faite" ? dateCourte(t.echeance) : e.texte) : "—"}
                        </td>
                        <td className="nombre facultatif">{t.estimationHeures ? heuresTexte(t.estimationHeures) : <span className="ton-discret">—</span>}</td>
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
