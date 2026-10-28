import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { dateCourte } from "@/lib/dates";
import { chargeDesPersonnes, type LigneCharge } from "@/lib/donnees/charge";
import { chargerOrganisation } from "@/lib/organisation";
import { Bandeau } from "@/components/Bandeau";
import { Jauge, LegendeCharge } from "@/components/Charge";
import { Chaleur } from "@/components/Graphiques";
import { ONGLETS_EQUIPE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Charge de travail" };

const RANG = { surchargee: 3, chargee: 2, normale: 1, libre: 0 } as const;

/**
 * Charge de travail de l'équipe : heures de tâches prévues chaque semaine, comparées aux heures
 * disponibles de chacun. Ouvert aux personnes qui suivent d'autres personnes (chefs d'équipe,
 * directeurs, exécutifs) ; chacun ne voit que les personnes qu'il suit.
 */
export default async function PageCharge({ searchParams }: { searchParams: Promise<{ equipe?: string; vue?: string }> }) {
  const { equipe, vue: v } = await searchParams;
  // Carte de chaleur (huit semaines, d'un coup d'œil) ou détail (heures, jauges, ce qui est à signaler).
  const vue = v === "detail" ? "detail" : "carte";
  const u = await exigerInterne();
  const a = await acces(u);
  if (!a.toutVoir && !a.directeur && a.equipeDirecte.length === 0) notFound();
  const org = await chargerOrganisation();
  const ids = a.suivis === "toutes" ? [...org.personnes.values()].filter((p) => p.actif && !p.externe).map((p) => p.id) : [...a.suivis];
  const { semaines, lignes: toutes } = await chargeDesPersonnes(ids, vue === "carte" ? 8 : undefined);

  const equipes = [...new Map(toutes.map((l) => [l.equipeId ?? "aucune", l.equipe])).entries()].sort((x, y) => (x[0] === "aucune" ? 1 : y[0] === "aucune" ? -1 : x[1].localeCompare(y[1], "fr")));
  const lignes = equipe ? toutes.filter((l) => (l.equipeId ?? "aucune") === equipe) : toutes;
  const pire = (l: LigneCharge) => Math.max(RANG[l.charge.semaines[0].niveau], RANG[l.charge.semaines[1]?.niveau ?? "libre"]);
  const groupes = equipes
    .filter(([eid]) => !equipe || eid === equipe)
    .map(([eid, nom]) => ({
      id: eid,
      nom,
      lignes: lignes.filter((l) => (l.equipeId ?? "aucune") === eid).sort((x, y) => pire(y) - pire(x) || x.nom.localeCompare(y.nom, "fr")),
    }))
    .filter((g) => g.lignes.length);

  const surCetteSemaine = lignes.filter((l) => l.charge.semaines[0].niveau === "surchargee").length;
  const surProchaine = lignes.filter((l) => l.charge.semaines[1]?.niveau === "surchargee").length;
  const chargees = lignes.filter((l) => l.charge.semaines[1]?.niveau === "chargee").length;
  const sansEstimation = lignes.reduce((s, l) => s + l.charge.sansEstimation, 0);
  const libres = lignes.filter((l) => l.charge.semaines[1]?.niveau === "libre" || (l.charge.semaines[1] && l.charge.semaines[1].heures < l.charge.semaines[1].capacite * 0.5)).length;

  return (
    <>
      <Bandeau surtitre="Équipe" titre="Charge de travail">
        <dl className="chiffres">
          <div className={`chiffre ${surCetteSemaine ? "chiffre--retard" : ""}`}>
            <dt>surchargée{surCetteSemaine > 1 ? "s" : ""} cette semaine</dt>
            <dd>{surCetteSemaine}</dd>
          </div>
          <div className={`chiffre ${surProchaine ? "chiffre--retard" : ""}`}>
            <dt>surchargée{surProchaine > 1 ? "s" : ""} la semaine prochaine</dt>
            <dd>{surProchaine}</dd>
          </div>
          <div className={`chiffre ${chargees ? "chiffre--veille" : ""}`}>
            <dt>chargée{chargees > 1 ? "s" : ""} la semaine prochaine</dt>
            <dd>{chargees}</dd>
          </div>
          <div className="chiffre">
            <dt>avec de la marge la semaine prochaine</dt>
            <dd>{libres}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_EQUIPE} courant="/charge" label="Équipe" />
        <div className="ligne-actions">
          {equipes.length > 1 ? (
            <nav className="filtres" aria-label="Filtrer par équipe">
              <a className="filtre" href={`/charge${vue === "detail" ? "?vue=detail" : ""}`} aria-current={!equipe ? "true" : undefined}>
                Tout le monde · {toutes.length}
              </a>
              {equipes.map(([eid, nom]) => (
                <a key={eid} className="filtre" href={`/charge?equipe=${eid}${vue === "detail" ? "&vue=detail" : ""}`} aria-current={equipe === eid ? "true" : undefined}>
                  {nom} · {toutes.filter((l) => (l.equipeId ?? "aucune") === eid).length}
                </a>
              ))}
            </nav>
          ) : (
            <span />
          )}
          <nav className="zoom" aria-label="Affichage">
            <a href={`/charge${equipe ? `?equipe=${equipe}` : ""}`} aria-current={vue === "carte" ? "true" : undefined}>
              Carte
            </a>
            <a href={`/charge?vue=detail${equipe ? `&equipe=${equipe}` : ""}`} aria-current={vue === "detail" ? "true" : undefined}>
              Détail
            </a>
          </nav>
          <LegendeCharge />
        </div>
        {vue === "carte" ? (
          <section className="carte" aria-label="Carte de chaleur de la charge, par personne et par semaine">
            <Chaleur
              semaines={semaines.map((s, i) => ({
                cle: s,
                libelle: i === 0 ? "Cette sem." : i === 1 ? "Sem. proch." : dateCourte(s),
                sous: i === 0 ? "jours restants" : undefined,
              }))}
              groupes={groupes.map((g) => ({
                id: g.id,
                nom: groupes.length > 1 ? g.nom : null,
                lignes: g.lignes.map((l) => ({
                  id: l.id,
                  nom: l.id === u.id ? `${l.nom} (vous)` : l.nom,
                  initiales: l.initiales,
                  sous: l.capacite !== 40 ? `${l.capacite} h/sem.` : undefined,
                  lien: `/personnes/${l.id}`,
                  cases: l.charge.semaines.map((w) => ({
                    ...w,
                    lien: `/personnes/${l.id}?semaine=${w.semaine}#charge`,
                  })),
                })),
              }))}
            />
          </section>
        ) : null}
        {vue === "detail" ? (
          <section className="carte defile-x" aria-label="Charge par personne et par semaine">
            <table className="table-charge">
              <thead>
                <tr>
                  <th scope="col">Personne</th>
                  {semaines.map((s, i) => (
                    <th key={s} scope="col">
                      {i === 0 ? "Cette semaine" : i === 1 ? "Semaine prochaine" : `Sem. du ${dateCourte(s)}`}
                      <small>{i === 0 ? "jours restants" : i === 1 ? `du ${dateCourte(s)}` : ""}</small>
                    </th>
                  ))}
                  <th scope="col">À signaler</th>
                </tr>
              </thead>
              {groupes.map((g) => (
                <tbody key={g.id}>
                  {groupes.length > 1 ? (
                    <tr className="groupe">
                      <th colSpan={semaines.length + 2} scope="rowgroup">
                        {g.nom}
                      </th>
                    </tr>
                  ) : null}
                  {g.lignes.map((l, n) => {
                    const signaux = [
                      l.charge.enRetard ? `${l.charge.enRetard} en retard` : null,
                      l.charge.bloquees ? `${l.charge.bloquees} bloquée${l.charge.bloquees > 1 ? "s" : ""}` : null,
                      l.charge.sansEstimation ? `${l.charge.sansEstimation} sans estimation` : null,
                      l.charge.sansDate ? `${l.charge.sansDate} sans date` : null,
                    ].filter(Boolean);
                    return (
                      <tr key={l.id}>
                        <th scope="row">
                          <a className="personne-charge" href={`/personnes/${l.id}`}>
                            <span className="mono" aria-hidden="true">
                              {l.initiales}
                            </span>
                            <span className="rangee__texte">
                              <span className="rangee__titre">{l.id === u.id ? `${l.nom} (vous)` : l.nom}</span>
                              <span className="rangee__sous">
                                {l.poste}
                                {l.capacite !== 40 ? ` · ${l.capacite} h/sem.` : ""}
                              </span>
                            </span>
                          </a>
                        </th>
                        {l.charge.semaines.map((w, i) => (
                          <td key={w.semaine}>
                            <Jauge heures={w.heures} capacite={w.capacite} niveau={w.niveau} lien={`/personnes/${l.id}?semaine=${w.semaine}#charge`} delai={Math.min(n * 40 + i * 30, 500)} />
                          </td>
                        ))}
                        <td className="note" style={{ whiteSpace: "nowrap" }}>
                          {signaux.length
                            ? signaux.map((x) => (
                                <span key={x} style={{ display: "block" }}>
                                  {x}
                                </span>
                              ))
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </section>
        ) : null}
        <p className="note">
          Les heures viennent du temps estimé de chaque tâche, réparti entre son début et son échéance (jours ouvrés). Une tâche sans estimation compte pour 4 h
          {sansEstimation ? ` (${sansEstimation} tâche${sansEstimation > 1 ? "s" : ""} ici)` : ""}. Les tâches bloquées ne comptent pas tant qu&apos;elles le restent. Les heures disponibles par
          semaine se règlent dans l&apos;écran Organisation.
        </p>
      </div>
    </>
  );
}
