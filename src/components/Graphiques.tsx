/**
 * Autres graphiques, dessinés au serveur (aucun script) :
 * - Chaleur : la charge de chacun, semaine par semaine (une case par semaine, colorée selon le niveau) ;
 * - FriseReports : les reports successifs de la date de fin d'un projet ;
 * - Glissements : pour chaque projet du portefeuille, de la fin initiale à la fin prévue ;
 * - RepartitionSante : combien de projets dans les temps, à surveiller, en retard ;
 * - BarresListe : des barres horizontales simples (heures de réunion par projet).
 * Chaque valeur est écrite ou s'atteint au clavier (titre, étiquette) : la couleur n'est jamais seule.
 */
import { dateCourte, ecartJours } from "@/lib/dates";
import { LIBELLE_NIVEAU, heuresTexte, type Niveau } from "@/lib/charge";

const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;
const annee = (iso: string) => iso.slice(0, 4);
const dateEtAnnee = (iso: string) => `${dateCourte(iso)} ${annee(iso)}`;
const semainesTexte = (jours: number) => {
  const s = Math.round(jours / 7);
  return s >= 9 ? `${Math.round(jours / 30.4)} mois` : `${s} sem.`;
};

// ---------------------------------------------------------------------------
// Carte de chaleur de la charge
// ---------------------------------------------------------------------------

export type CaseChaleur = {
  semaine: string;
  heures: number;
  capacite: number;
  niveau: Niveau;
  lien?: string;
  /** Texte de la case et étiquette au survol, quand ce n'est pas la charge prévue (charge réalisée). */
  texte?: string;
  etiquette?: string;
};
export type LigneChaleur = {
  id: string;
  nom: string;
  initiales: string;
  sous?: string;
  lien: string;
  cases: CaseChaleur[];
};

export function Chaleur({ semaines, groupes }: { semaines: { cle: string; libelle: string; sous?: string }[]; groupes: { id: string; nom: string | null; lignes: LigneChaleur[] }[] }) {
  return (
    <div className="defile-x">
      <table className="chaleur">
        <thead>
          <tr>
            <th scope="col">Personne</th>
            {semaines.map((s) => (
              <th key={s.cle} scope="col">
                {s.libelle}
                {s.sous ? <small>{s.sous}</small> : null}
              </th>
            ))}
          </tr>
        </thead>
        {groupes.map((g) => (
          <tbody key={g.id}>
            {g.nom ? (
              <tr className="chaleur__groupe">
                <th colSpan={semaines.length + 1} scope="rowgroup">
                  {g.nom}
                </th>
              </tr>
            ) : null}
            {g.lignes.map((l) => (
              <tr key={l.id}>
                <th scope="row">
                  <a className="chaleur__personne" href={l.lien}>
                    <span className="mono mono--petit" aria-hidden="true">
                      {l.initiales}
                    </span>
                    <span className="chaleur__nom">
                      {l.nom}
                      {l.sous ? <small>{l.sous}</small> : null}
                    </span>
                  </a>
                </th>
                {l.cases.map((c, i) => {
                  const taux = c.capacite > 0 ? Math.round((c.heures / c.capacite) * 100) : null;
                  const etiquette = c.etiquette ?? `${l.nom}, ${semaines[i]?.libelle.toLowerCase() ?? ""} : ${heuresTexte(c.heures)} prévues sur ${heuresTexte(c.capacite)} disponibles (${LIBELLE_NIVEAU[c.niveau].toLowerCase()})`;
                  const contenu = c.texte ?? (c.heures > 0 ? `${taux ?? "—"} %` : "—");
                  return (
                    <td key={c.semaine}>
                      {c.lien ? (
                        <a className={`chaleur__case chaleur__case--${c.niveau}`} href={c.lien} title={etiquette} aria-label={etiquette}>
                          {contenu}
                        </a>
                      ) : (
                        <span className={`chaleur__case chaleur__case--${c.niveau}`} title={etiquette} role="img" aria-label={etiquette}>
                          {contenu}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Axe du temps commun (frise, glissements)
// ---------------------------------------------------------------------------

function axeTemps(dates: string[], marge = 20) {
  const tri = [...dates].sort();
  const debut = tri[0];
  const fin = tri[tri.length - 1];
  const total = Math.max(1, ecartJours(debut, fin));
  const position = (d: string) => marge / 2 + (ecartJours(debut, d) / total) * (100 - marge);
  return { debut, fin, position };
}

/** Repères de l'axe : le 1er de quelques mois (un sur trois si la période est longue). */
function reperes(debut: string, fin: string): string[] {
  const mois = Math.max(1, Math.round(ecartJours(debut, fin) / 30.4));
  const pas = mois > 24 ? 6 : mois > 9 ? 3 : 1;
  const out: string[] = [];
  const d = new Date(`${debut.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.toISOString().slice(0, 10) <= fin) {
    if (d.getUTCMonth() % pas === 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
const libelleRepere = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));

// ---------------------------------------------------------------------------
// Reports de la date de fin d'un projet
// ---------------------------------------------------------------------------

export type ReportFin = {
  avant: string | null;
  apres: string | null;
  le: string;
};

export function FriseReports({ initiale, actuelle, reports, jour }: { initiale: string | null; actuelle: string | null; reports: ReportFin[]; jour: string }) {
  // Les dates prévues successives : l'initiale, puis chaque report.
  const etapes: { date: string; le: string | null }[] = [];
  if (initiale) etapes.push({ date: initiale, le: null });
  for (const r of reports) if (r.apres) etapes.push({ date: r.apres, le: r.le });
  if (actuelle && etapes.at(-1)?.date !== actuelle) etapes.push({ date: actuelle, le: null });
  if (etapes.length < 2) return null;
  const premiere = etapes[0].date;
  const derniere = etapes[etapes.length - 1].date;
  const ecart = ecartJours(premiere, derniere);
  const axe = axeTemps([...etapes.map((e) => e.date), ...(jour > premiere && jour < derniere ? [jour] : [])]);
  const texte = `Fin prévue : ${dateEtAnnee(premiere)} au départ, ${dateEtAnnee(derniere)} aujourd'hui${ecart > 0 ? `, ${semainesTexte(ecart)} plus tard` : ecart < 0 ? `, ${semainesTexte(-ecart)} plus tôt` : ""}, en ${etapes.length - 1} changement${etapes.length > 2 ? "s" : ""}.`;
  const recents = reports
    .filter((r) => r.apres)
    .slice(-5)
    .reverse();
  return (
    <figure className="reports-fin" aria-label={texte}>
      <p className="reports-fin__resume">
        {ecart > 0 ? <strong>+{semainesTexte(ecart)}</strong> : ecart < 0 ? <strong>−{semainesTexte(-ecart)}</strong> : <strong>Inchangée</strong>}
        <span>
          {" "}
          depuis la fin initiale · {etapes.length - 1} report
          {etapes.length > 2 ? "s" : ""}
        </span>
      </p>
      <div className="reports-fin__piste" aria-hidden="true">
        <span
          className="reports-fin__trait"
          style={{
            left: pct(axe.position(premiere)),
            width: pct(axe.position(derniere) - axe.position(premiere)),
          }}
        />
        {jour > premiere && jour < derniere ? <span className="reports-fin__aujourdhui" style={{ left: pct(axe.position(jour)) }} title={`Aujourd'hui, ${dateCourte(jour)}`} /> : null}
        {etapes.map((e, i) => (
          <span
            key={`${e.date}-${i}`}
            className={`reports-fin__point${i === 0 ? " reports-fin__point--initiale" : i === etapes.length - 1 ? " reports-fin__point--actuelle" : ""}`}
            style={{ left: pct(axe.position(e.date)) }}
            title={i === 0 ? `Fin initiale : ${dateEtAnnee(e.date)}` : `${dateEtAnnee(e.date)}${e.le ? `, décidé le ${dateEtAnnee(e.le)}` : ""}`}
          />
        ))}
      </div>
      <div className="reports-fin__bornes" aria-hidden="true">
        <span>
          Initiale
          <strong>{dateEtAnnee(premiere)}</strong>
        </span>
        <span>
          Prévue
          <strong>{dateEtAnnee(derniere)}</strong>
        </span>
      </div>
      {recents.length ? (
        <ol className="reports-fin__liste">
          {recents.map((r, i) => (
            <li key={`${r.le}-${i}`}>
              <span className="reports-fin__le">{dateEtAnnee(r.le)}</span>
              <span>
                {r.avant ? dateCourte(r.avant) : "—"} → <strong>{dateEtAnnee(r.apres!)}</strong>
                {r.avant ? (
                  <span className="ton-discret">
                    {" "}
                    · {ecartJours(r.avant, r.apres!) >= 0 ? "+" : "−"}
                    {semainesTexte(Math.abs(ecartJours(r.avant, r.apres!)))}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="note" style={{ margin: 0 }}>
          Les reports sont notés un à un depuis octobre 2026 ; avant, seul l&apos;écart total est connu.
        </p>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Glissements du portefeuille
// ---------------------------------------------------------------------------

export type ProjetGlissement = {
  id: string;
  code: string;
  titre: string;
  initiale: string;
  prevue: string;
};

export function Glissements({ projets, jour }: { projets: ProjetGlissement[]; jour: string }) {
  if (!projets.length) return <p className="vide">Aucun projet n&apos;a de fin initiale et de fin prévue à comparer.</p>;
  const tries = [...projets].sort((a, b) => ecartJours(b.initiale, b.prevue) - ecartJours(a.initiale, a.prevue) || a.code.localeCompare(b.code));
  const axe = axeTemps([...tries.flatMap((p) => [p.initiale, p.prevue]), jour], 6);
  const marques = reperes(axe.debut, axe.fin);
  return (
    <div className="glissements">
      <ul className="glissements__liste">
        {tries.map((p) => {
          const ecart = ecartJours(p.initiale, p.prevue);
          const a = axe.position(p.initiale);
          const b = axe.position(p.prevue);
          const texte = `${p.code} · ${p.titre} : fin initiale ${dateEtAnnee(p.initiale)}, fin prévue ${dateEtAnnee(p.prevue)}${ecart > 0 ? `, ${semainesTexte(ecart)} de retard` : ecart < 0 ? `, ${semainesTexte(-ecart)} d'avance` : ", inchangée"}`;
          return (
            <li key={p.id}>
              <a href={`/projets/${p.id}`} className="glissements__ligne" aria-label={texte} title={texte}>
                <span className="glissements__nom">
                  <span className="etiquette-projet">{p.code}</span>
                  <span className="glissements__titre">{p.titre}</span>
                </span>
                <span className="glissements__piste" aria-hidden="true">
                  {jour >= axe.debut && jour <= axe.fin ? <span className="glissements__aujourdhui" style={{ left: pct(axe.position(jour)) }} /> : null}
                  <span
                    className={`glissements__trait${ecart > 0 ? " glissements__trait--retard" : ""}`}
                    style={{
                      left: pct(Math.min(a, b)),
                      width: pct(Math.abs(b - a)),
                    }}
                  />
                  <span className="glissements__point glissements__point--initiale" style={{ left: pct(a) }} />
                  <span className={`glissements__point${ecart > 0 ? " glissements__point--retard" : ""}`} style={{ left: pct(b) }} />
                </span>
                <span className={`glissements__ecart${ecart > 0 ? " ton-retard" : ""}`}>{ecart > 0 ? `+${semainesTexte(ecart)}` : ecart < 0 ? `−${semainesTexte(-ecart)}` : "="}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="glissements__axe" aria-hidden="true">
        <span />
        <span className="glissements__reperes">
          {marques.map((m, i) => (
            <span key={m} style={{ left: pct(axe.position(m)) }} data-impair={i % 2 === 1 ? "1" : undefined}>
              {libelleRepere(m)}
            </span>
          ))}
          {jour >= axe.debut && jour <= axe.fin ? (
            <span className="glissements__repere-jour" style={{ left: pct(axe.position(jour)) }}>
              aujourd&apos;hui
            </span>
          ) : null}
        </span>
        <span />
      </div>
      <p className="glissements__legende" aria-hidden="true">
        <span>
          <i className="glissements__cle glissements__cle--initiale" /> Fin initiale
        </span>
        <span>
          <i className="glissements__cle" /> Fin prévue aujourd&apos;hui
        </span>
        {tries.some((p) => ecartJours(p.initiale, p.prevue) > 0) ? (
          <span>
            <i className="glissements__cle glissements__cle--retard" /> Repoussée
          </span>
        ) : null}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Santé du portefeuille
// ---------------------------------------------------------------------------

const SANTES = [
  { id: "dans_les_temps", libelle: "Dans les temps" },
  { id: "a_surveiller", libelle: "À surveiller" },
  { id: "en_retard", libelle: "En retard" },
] as const;

export function RepartitionSante({ compte }: { compte: Record<"dans_les_temps" | "a_surveiller" | "en_retard", number> }) {
  const total = SANTES.reduce((s, x) => s + compte[x.id], 0);
  if (!total) return null;
  const texte = SANTES.map((x) => `${compte[x.id]} ${x.libelle.toLowerCase()}`).join(", ");
  return (
    <div className="sante-barre">
      <div className="sante-barre__piste" role="img" aria-label={`Santé des projets : ${texte}`}>
        {SANTES.filter((x) => compte[x.id]).map((x) => (
          <span key={x.id} className={`sante-barre__part sante-barre__part--${x.id}`} style={{ flexGrow: compte[x.id] }} title={`${x.libelle} : ${compte[x.id]}`} />
        ))}
      </div>
      <ul className="sante-barre__legende" aria-hidden="true">
        {SANTES.map((x) => (
          <li key={x.id}>
            <i className={`sante-barre__cle sante-barre__part--${x.id}`} />
            <strong>{compte[x.id]}</strong> {x.libelle.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barres horizontales
// ---------------------------------------------------------------------------

export type Barre = {
  cle: string;
  libelle: string;
  code?: string;
  valeur: number;
  texte: string;
  lien?: string;
};

export function BarresListe({ barres, titre }: { barres: Barre[]; titre: string }) {
  if (!barres.length) return <p className="vide">Rien sur la période.</p>;
  const max = Math.max(1, ...barres.map((b) => b.valeur));
  return (
    <ul className="barres" aria-label={titre}>
      {barres.map((b) => {
        const contenu = (
          <>
            <span className="barres__nom">
              {b.code ? <span className="etiquette-projet">{b.code}</span> : null}
              <span className="barres__libelle">{b.libelle}</span>
            </span>
            <span className="barres__piste" aria-hidden="true">
              <span className="barres__plein" style={{ width: pct((b.valeur / max) * 100) }} />
            </span>
            <span className="barres__valeur">{b.texte}</span>
          </>
        );
        return (
          <li key={b.cle}>
            {b.lien ? (
              <a href={b.lien} className="barres__ligne">
                {contenu}
              </a>
            ) : (
              <span className="barres__ligne">{contenu}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
