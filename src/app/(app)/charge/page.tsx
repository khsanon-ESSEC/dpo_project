import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { dateCourte } from "@/lib/dates";
import { capacites, chargeDesPersonnes, noterChargesPrevues, type LigneCharge } from "@/lib/donnees/charge";
import { planBilan, vueValide } from "@/lib/bilan";
import { ajouterJours, aujourdhui } from "@/lib/dates";
import { LIBELLE_MOTIF, texteAbsence } from "@/lib/absences";
import { initiales, nomComplet } from "@/lib/regles";
import { ChoixPeriode } from "@/components/ChoixPeriode";
import { ChargePassee } from "./ChargePassee";
import { chargerOrganisation } from "@/lib/organisation";
import { Bandeau, LienChiffre } from "@/components/Bandeau";
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
const QUI = {
  surchargees: "Surchargées cette semaine",
  "surchargees-prochaine": "Surchargées la semaine prochaine",
  chargees: "Chargées la semaine prochaine",
  marge: "Avec de la marge la semaine prochaine",
} as const;

export default async function PageCharge({ searchParams }: { searchParams: Promise<{ equipe?: string; vue?: string; periode?: string; p?: string; qui?: string }> }) {
  const { equipe, vue: v, periode, p: param, qui: q } = await searchParams;
  // Le chiffre cliqué dans le bandeau : seulement ces personnes.
  const qui = q && q in QUI ? (q as keyof typeof QUI) : null;
  // Carte de chaleur (huit semaines, d'un coup d'œil) ou détail (heures, jauges, ce qui est à signaler).
  const vue = v === "detail" ? "detail" : "carte";
  const u = await exigerInterne();
  const a = await acces(u);
  if (!a.toutVoir && !a.directeur && a.equipeDirecte.length === 0) notFound();
  const org = await chargerOrganisation();
  const ids = a.suivis === "toutes" ? [...org.personnes.values()].filter((p) => p.actif && !p.externe).map((p) => p.id) : [...a.suivis];
  // La charge prévue de la semaine est notée au premier passage (la tournée du serveur le fait aussi chaque heure).
  await noterChargesPrevues().catch(() => 0);

  // Une période passée ou en cours : la charge réalisée (et prévue, quand elle a été notée).
  const passe = vueValide(periode);
  if (passe) {
    const caps = await capacites(ids);
    const personnes = ids
      .map((id) => org.personnes.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.actif && !p.externe)
      .map((p) => ({ id: p.id, nom: nomComplet(p), initiales: initiales(p), equipeId: p.equipeId, equipe: p.equipeId ? (org.equipes.get(p.equipeId)?.nom ?? "") : "Sans équipe", capacite: caps.get(p.id) ?? 40 }));
    const equipesPassees = [...new Map(personnes.map((l) => [l.equipeId ?? "aucune", l.equipe])).entries()].sort((x, y) => (x[0] === "aucune" ? 1 : y[0] === "aucune" ? -1 : x[1].localeCompare(y[1], "fr")));
    return <ChargePassee vue={passe} param={param} personnes={personnes} equipe={equipe} equipes={equipesPassees} moi={u.id} />;
  }
  const { semaines, lignes: toutes } = await chargeDesPersonnes(ids, vue === "carte" ? 8 : undefined);

  const equipes = [...new Map(toutes.map((l) => [l.equipeId ?? "aucune", l.equipe])).entries()].sort((x, y) => (x[0] === "aucune" ? 1 : y[0] === "aucune" ? -1 : x[1].localeCompare(y[1], "fr")));
  const lignes = equipe ? toutes.filter((l) => (l.equipeId ?? "aucune") === equipe) : toutes;
  const pire = (l: LigneCharge) => Math.max(RANG[l.charge.semaines[0].niveau], RANG[l.charge.semaines[1]?.niveau ?? "libre"]);
  const aDeLaMarge = (l: LigneCharge) => l.charge.semaines[1]?.niveau === "libre" || (!!l.charge.semaines[1] && l.charge.semaines[1].heures < l.charge.semaines[1].capacite * 0.5);
  const garde = (l: LigneCharge) =>
    !qui ||
    (qui === "surchargees" ? l.charge.semaines[0].niveau === "surchargee" : qui === "surchargees-prochaine" ? l.charge.semaines[1]?.niveau === "surchargee" : qui === "chargees" ? l.charge.semaines[1]?.niveau === "chargee" : aDeLaMarge(l));
  const groupes = equipes
    .filter(([eid]) => !equipe || eid === equipe)
    .map(([eid, nom]) => ({
      id: eid,
      nom,
      lignes: lignes.filter((l) => (l.equipeId ?? "aucune") === eid && garde(l)).sort((x, y) => pire(y) - pire(x) || x.nom.localeCompare(y.nom, "fr")),
    }))
    .filter((g) => g.lignes.length);

  const finVue = ajouterJours(semaines.at(-1)!, 6);
  const absencesVues = lignes
    .flatMap((l) => l.absences.filter((x) => x.debut <= finVue).map((x) => ({ ...x, nom: l.id === u.id ? `${l.nom} (vous)` : l.nom })))
    .sort((x, y) => x.debut.localeCompare(y.debut) || x.nom.localeCompare(y.nom, "fr"));
  const surCetteSemaine = lignes.filter((l) => l.charge.semaines[0].niveau === "surchargee").length;
  const surProchaine = lignes.filter((l) => l.charge.semaines[1]?.niveau === "surchargee").length;
  const chargees = lignes.filter((l) => l.charge.semaines[1]?.niveau === "chargee").length;
  const sansEstimation = lignes.reduce((s, l) => s + l.charge.sansEstimation, 0);
  const libres = lignes.filter(aDeLaMarge).length;
  const lienQui = (k: keyof typeof QUI) => `/charge?qui=${k}${equipe ? `&equipe=${equipe}` : ""}${vue === "detail" ? "&vue=detail" : ""}#charge-liste`;

  return (
    <>
      <Bandeau surtitre="Équipe" titre="Charge de travail">
        <dl className="chiffres">
          <div className={`chiffre ${surCetteSemaine ? "chiffre--retard" : ""}`}>
            <dt>
              <LienChiffre href={lienQui("surchargees")} detail="voir ces personnes">
                surchargée{surCetteSemaine > 1 ? "s" : ""} cette semaine
              </LienChiffre>
            </dt>
            <dd>{surCetteSemaine}</dd>
          </div>
          <div className={`chiffre ${surProchaine ? "chiffre--retard" : ""}`}>
            <dt>
              <LienChiffre href={lienQui("surchargees-prochaine")} detail="voir ces personnes">
                surchargée{surProchaine > 1 ? "s" : ""} la semaine prochaine
              </LienChiffre>
            </dt>
            <dd>{surProchaine}</dd>
          </div>
          <div className={`chiffre ${chargees ? "chiffre--veille" : ""}`}>
            <dt>
              <LienChiffre href={lienQui("chargees")} detail="voir ces personnes">
                chargée{chargees > 1 ? "s" : ""} la semaine prochaine
              </LienChiffre>
            </dt>
            <dd>{chargees}</dd>
          </div>
          <div className="chiffre">
            <dt>
              <LienChiffre href={lienQui("marge")} detail="voir ces personnes">
                avec de la marge la semaine prochaine
              </LienChiffre>
            </dt>
            <dd>{libres}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_EQUIPE} courant="/charge" label="Équipe" />
        <ChoixPeriode
          plan={planBilan("semaine", undefined, aujourdhui(), 10)}
          noms={{ actuel: "", avantCourt: "" }}
          lien={(pv, pp) => `/charge?periode=${pv}${pp ? `&p=${pp}` : ""}${equipe ? `&equipe=${equipe}` : ""}`}
          comparer={false}
          active={false}
          avant={
            <a href={`/charge${equipe ? `?equipe=${equipe}` : ""}`} aria-current="true" title="Les semaines à venir">
              À venir
            </a>
          }
        />
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
        <span id="charge-liste" style={{ display: "block", scrollMarginTop: 80 }} />
        {qui ? (
          <p className="note" style={{ margin: 0 }}>
            Seulement : {QUI[qui].toLowerCase()} ·{" "}
            <a href={`/charge${equipe ? `?equipe=${equipe}` : ""}${vue === "detail" ? `${equipe ? "&" : "?"}vue=detail` : ""}`} className="lien-discret">
              voir tout le monde
            </a>
          </p>
        ) : null}
        {qui && groupes.length === 0 ? <p className="vide">Personne dans ce cas.</p> : null}
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
                            <Jauge heures={w.heures} capacite={w.capacite} niveau={w.niveau} absence={w.absence} jours={w.jours} lien={`/personnes/${l.id}?semaine=${w.semaine}#charge`} delai={Math.min(n * 40 + i * 30, 500)} />
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
        {absencesVues.length ? (
          <section className="carte carte--liste" aria-labelledby="charge-absences">
            <h2 id="charge-absences" className="carte__titre">
              Absences · {semaines.length} prochaines semaines
            </h2>
            <ul className="liste">
              {absencesVues.map((x) => (
                <li key={x.id} className="rangee rangee--etiree">
                  <span className="rangee__texte">
                    <a href={`/personnes/${x.personneId}#absences`} className="rangee__titre rangee__lien">
                      {x.nom}
                    </a>
                    <span className="rangee__sous">
                      {LIBELLE_MOTIF[x.motif]} {texteAbsence(x)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="note">
          Les heures viennent du temps estimé de chaque tâche, réparti entre son début et son échéance (jours ouvrés). Une tâche sans estimation compte pour 4 h
          {sansEstimation ? ` (${sansEstimation} tâche${sansEstimation > 1 ? "s" : ""} ici)` : ""}. Les tâches bloquées ne comptent pas tant qu&apos;elles le restent. Les heures disponibles par
          semaine se règlent dans l&apos;écran Organisation ; les jours d&apos;absence notés (profil ou fiche de la personne, ou « absent du … au … » dans la barre) en sont retirés.
        </p>
      </div>
    </>
  );
}
