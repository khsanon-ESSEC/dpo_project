import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { ecart, etatComparaison, moisDebutExercice, planBilan, type Mesures } from "@/lib/bilan";
import { aLa, etiquettesAxe, nomsDesPeriodes } from "@/lib/bilan-libelles";
import { nombre } from "@/lib/charge";
import { activite } from "@/lib/donnees/bilan";
import { monEquipe } from "@/lib/donnees/equipe";
import { periodePreferee } from "@/lib/periode-preferee";
import { dureeTexte } from "@/lib/projets";
import { Bandeau } from "@/components/Bandeau";
import { ChoixPeriode, NoteComparaison } from "@/components/ChoixPeriode";
import { Tendance } from "@/components/Courbes";
import { GraphesActivite } from "@/components/GraphesActivite";
import { LienPersonne } from "@/components/Liens";
import { ONGLETS_EQUIPE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Bilan de l'équipe" };

const h = (m: number) => (m ? dureeTexte(m) : "0 h");

function Cellules({ m, avant, comparer }: { m: Mesures; avant: Mesures; comparer: boolean }) {
  const e = (t: string | null) => (comparer ? (t ?? "—") : "");
  return (
    <>
      <td>
        {m.taches}
        <small>{e(ecart(m.taches, avant.taches))}</small>
      </td>
      <td>
        {nombre(m.heures)} h<small>{e(ecart(m.heures, avant.heures, " h"))}</small>
      </td>
      <td>
        {m.tauxCharge === null ? "—" : `${m.tauxCharge} %`}
        {m.tauxPrevu !== null ? <span className="ton-discret"> · prévue {m.tauxPrevu} %</span> : null}
        <small>{e(ecart(m.tauxCharge, avant.tauxCharge, " pts"))}</small>
      </td>
      <td>
        {m.aLHeure === null ? "—" : `${m.aLHeure} %`}
        <small>{e(ecart(m.aLHeure, avant.aLHeure, " pts"))}</small>
      </td>
      <td>
        {h(m.minutesReunion)}
        {m.partReunion === null ? "" : ` · ${m.partReunion} %`}
        <small>{e(ecart(m.partReunion, avant.partReunion, " pts"))}</small>
      </td>
      <td>
        {m.rapportsAttendus ? `${m.rapportsEnvoyes}/${m.rapportsAttendus}` : "—"}
        <small>{comparer && avant.rapportsAttendus ? `${avant.rapportsEnvoyes}/${avant.rapportsAttendus} avant` : ""}</small>
      </td>
    </>
  );
}

function lien(vue: string, param?: string) {
  return `/equipe/bilan?vue=${vue}${param ? `&p=${param}` : ""}`;
}

export default async function PageBilanEquipe({ searchParams }: { searchParams: Promise<{ vue?: string; p?: string; mois?: string }> }) {
  const { vue, p, mois: ancien } = await searchParams;
  const u = await exigerInterne();
  const a = await acces(u);
  if (!(a.equipeDirecte.length > 0 || a.directeur || a.toutVoir)) redirect("/bilan");
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  // « ?mois= » : les liens d'avant, vers un mois. Sans période dans l'adresse : la dernière choisie, sinon le mois.
  const plan = planBilan(vue ?? (ancien ? "mois" : await periodePreferee("mois")), p ?? ancien, aujourdhui(), debutExercice);
  const e = await monEquipe(a);
  const ids = e.personnes.map((x) => x.id);
  const act = await activite(ids, plan);
  const etat = etatComparaison(plan, act.debuts.activite);
  const t = act.total(0);
  const tAvant = act.total(1);
  const n = nomsDesPeriodes(plan, debutExercice);
  const ec = (v: string | null) => (etat.comparer ? (v ?? "—") : "—");
  const etiquettes = etiquettesAxe(plan);
  const parPas = plan.vue === "semaine" ? "Tâches par semaine" : "Tâches par mois";

  return (
    <>
      <Bandeau surtitre={`${n.actuel}${etat.comparer ? ` · comparé ${aLa(n.avantCourt)}${plan.enCours ? " à la même date" : ""}` : ""}`} titre="Bilan de l'équipe">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>tâches terminées · {ec(ecart(t.taches, tAvant.taches))}</dt>
            <dd>{t.taches}</dd>
          </div>
          <div className="chiffre">
            <dt>heures livrées · {ec(ecart(t.heures, tAvant.heures, " h"))}</dt>
            <dd>
              {nombre(t.heures)}
              <small>&nbsp;h</small>
            </dd>
          </div>
          <div className={`chiffre ${(t.tauxCharge ?? 0) > 100 ? "chiffre--retard" : (t.tauxCharge ?? 0) > 85 ? "chiffre--veille" : ""}`}>
            <dt>charge réalisée · {ec(ecart(t.tauxCharge, tAvant.tauxCharge, " pts"))}</dt>
            <dd>
              {t.tauxCharge ?? "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
          <div className={`chiffre ${(t.partReunion ?? 0) >= 30 ? "chiffre--veille" : ""}`}>
            <dt>du temps en réunion · {ec(ecart(t.partReunion, tAvant.partReunion, " pts"))}</dt>
            <dd>
              {t.partReunion ?? "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_EQUIPE} courant="/equipe/bilan" label="Équipe" />
        <ChoixPeriode plan={plan} noms={n} lien={lien} comparer={etat.comparer} />
        <NoteComparaison plan={plan} noms={n} etat={etat} debutDonnees={act.debuts.activite} />

        <section aria-labelledby="bilan-evolution">
          <h2 id="bilan-evolution" className="visuellement-cache">
            Évolution sur la période
          </h2>
          <GraphesActivite plan={plan} noms={n} etat={etat} actuel={t} avant={tAvant} serie={(k) => act.total(act.iSerie(k))} serieAvant={(k) => act.total(act.iSerieAvant(k))} redige equipe />
        </section>

        {e.groupes.map((g) => {
          const qui = g.personnes.map((x) => x.id);
          return (
            <section key={g.chefId} className="carte" aria-labelledby={`bg-${g.chefId}`}>
              <h2 id={`bg-${g.chefId}`} className="carte__titre" style={{ marginBottom: 4 }}>
                {g.titre}
              </h2>
              {g.sous ? <p className="note" style={{ margin: "0 0 8px" }}>{g.sous}</p> : null}
              <div className="defile-x">
                <table className="comparaison" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th scope="col">Personne</th>
                      <th scope="col">Tâches terminées</th>
                      <th scope="col">Heures livrées</th>
                      <th scope="col">Charge réalisée</th>
                      <th scope="col">À temps</th>
                      <th scope="col">En réunion</th>
                      <th scope="col">Rapports</th>
                      <th scope="col">{parPas}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...g.personnes]
                      .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
                      .map((x) => (
                        <tr key={x.id}>
                          <th scope="row">
                            <LienPersonne id={x.id}>{x.nom}</LienPersonne>
                            <small>
                              <a href={`/personnes/${x.id}?vue=${plan.vue}&p=${plan.cle}#evolution`} className="lien-discret">
                                Son évolution
                              </a>
                            </small>
                          </th>
                          <Cellules m={act.de(x.id, 0)} avant={act.de(x.id, 1)} comparer={etat.comparer} />
                          <td className="comparaison__tendance">
                            {/* Chacun comparé à lui-même : sa propre courbe, jamais côte à côte avec les autres. */}
                            <Tendance valeurs={plan.serie.map((per, k) => (etat.avecDonnees(per) ? act.de(x.id, act.iSerie(k)).taches : null))} libelles={etiquettes.map((l) => l.libelle)} unite="nombre" />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {g.personnes.length > 1 ? (
                    <tfoot>
                      <tr>
                        <th scope="row">Ensemble · {g.personnes.length}</th>
                        <Cellules m={act.total(0, qui)} avant={act.total(1, qui)} comparer={etat.comparer} />
                        <td className="comparaison__tendance">
                          <Tendance valeurs={plan.serie.map((per, k) => (etat.avecDonnees(per) ? act.total(act.iSerie(k), qui).taches : null))} libelles={etiquettes.map((l) => l.libelle)} unite="nombre" />
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </section>
          );
        })}
        {e.groupes.length === 0 ? <p className="vide">Personne dans votre équipe.</p> : null}
        <p className="avertissement-bilan">
          {etat.comparer ? `Sous chaque chiffre, l'écart avec ${n.avantCourt}. ` : ""}Ces chiffres décrivent ce qui est enregistré dans l&apos;application (tâches marquées faites, une tâche sans estimation comptant pour 4 h ;
          réunions notées ; rapports envoyés). La charge réalisée répartit les heures estimées de chaque tâche terminée de son début à sa fin ; la charge prévue est notée chaque lundi. Ils ne mesurent ni la qualité du travail ni ce
          qui n&apos;est pas noté : ils servent à ouvrir une conversation avec la personne, pas à la classer. C&apos;est pourquoi chacun n&apos;est comparé qu&apos;à lui-même.
        </p>
      </div>
    </>
  );
}
