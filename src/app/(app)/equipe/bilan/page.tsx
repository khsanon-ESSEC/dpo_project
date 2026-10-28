import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { aujourdhui, dateCourte, moisAnnee } from "@/lib/dates";
import { additionner, ecart, moisDebutExercice, nomExercice, planBilan, VUES_BILAN, type Mesures, type Periode, type PlanBilan } from "@/lib/bilan";
import { nombre } from "@/lib/charge";
import { bilans, debutDesDonnees } from "@/lib/donnees/bilan";
import { monEquipe } from "@/lib/donnees/equipe";
import { dureeTexte } from "@/lib/projets";
import { Bandeau } from "@/components/Bandeau";
import { Courbes, Jauge, Tendance, valeurTexte, type PointCourbe, type Unite } from "@/components/Courbes";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { ONGLETS_EQUIPE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Bilan de l'équipe" };

const h = (m: number) => (m ? dureeTexte(m) : "0 h");
const moisCourt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const moisSeul = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });
const versDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** « octobre 2026 », « août à octobre 2026 », « novembre 2025 à avril 2026 ». */
function plage(p: Periode): string {
  if (p.debut.slice(0, 7) === p.fin.slice(0, 7)) return moisAnnee(p.debut);
  const memeAnnee = p.debut.slice(0, 4) === p.fin.slice(0, 4);
  return `${memeAnnee ? moisSeul.format(versDate(p.debut)) : moisAnnee(p.debut)} à ${moisAnnee(p.fin)}`;
}

/** Les mesures montrées en courbe, avec leur unité. */
const MESURES: { id: string; titre: string; unite: Unite; valeur: (m: Mesures) => number | null; ecart: (a: Mesures, b: Mesures) => string | null }[] = [
  { id: "taches", titre: "Tâches terminées", unite: "nombre", valeur: (m) => m.taches, ecart: (a, b) => ecart(a.taches, b.taches) },
  { id: "heures", titre: "Heures livrées", unite: "heures", valeur: (m) => m.heures, ecart: (a, b) => ecart(a.heures, b.heures, " h") },
  { id: "temps", titre: "Terminées à temps", unite: "pourcent", valeur: (m) => m.aLHeure, ecart: (a, b) => ecart(a.aLHeure, b.aLHeure, " pts") },
  { id: "reunion", titre: "Part du temps en réunion", unite: "pourcent", valeur: (m) => m.partReunion, ecart: (a, b) => ecart(a.partReunion, b.partReunion, " pts") },
];

const partRapports = (m: Mesures) => (m.rapportsAttendus ? Math.round((m.rapportsEnvoyes / m.rapportsAttendus) * 100) : null);

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

/** Les noms des deux périodes, pour la légende, le bandeau et la navigation. */
function noms(plan: PlanBilan, debutExercice: number) {
  if (plan.vue === "exercice") {
    const a = Number(plan.cle);
    return { actuel: `Exercice ${nomExercice(a, debutExercice)}`, avant: `Exercice ${nomExercice(a - 1, debutExercice)}`, avantCourt: `l'exercice ${nomExercice(a - 1, debutExercice)}` };
  }
  if (plan.vue === "mois") return { actuel: majuscule(plage(plan.actuel)), avant: majuscule(plage(plan.precedent)), avantCourt: moisSeul.format(versDate(plan.precedent.debut)) };
  const n = plan.vue === "3m" ? 3 : 6;
  return { actuel: majuscule(plage({ ...plan.actuel, fin: `${plan.cle}-01` })), avant: `Les ${n} mois d'avant`, avantCourt: plage({ ...plan.precedent, fin: `${plan.precedent.cle}-01` }) };
}

export default async function PageBilanEquipe({ searchParams }: { searchParams: Promise<{ vue?: string; p?: string; mois?: string }> }) {
  const { vue, p, mois: ancien } = await searchParams;
  const u = await exigerInterne();
  const a = await acces(u);
  if (!(a.equipeDirecte.length > 0 || a.directeur || a.toutVoir)) redirect("/bilan");
  const jour = aujourdhui();
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  // « ?mois= » : les liens d'avant, vers un mois.
  const plan = planBilan(vue ?? (ancien ? "mois" : undefined), p ?? ancien, jour, debutExercice);
  const e = await monEquipe(a);
  const ids = e.personnes.map((x) => x.id);
  const serieAvant = plan.serieAvant ?? [];
  const [mesures, debuts] = await Promise.all([bilans(ids, [plan.actuel, plan.precedent, ...plan.serie, ...serieAvant]), debutDesDonnees()]);
  const de = (id: string, i: number) => mesures.get(id)![i];
  const total = (i: number, qui = ids) => additionner(qui.map((id) => de(id, i)));
  const iSerie = (k: number) => 2 + k;
  const iAvant = (k: number) => 2 + plan.serie.length + k;

  // Avant les premières données de l'application, il n'y a rien : ni zéro, ni comparaison.
  const debutDonnees = debuts.activite;
  const avecDonnees = (per: Periode) => !!debutDonnees && per.fin >= debutDonnees;
  // Mois par mois : les mois renseignés de la période comparée. Les totaux : seulement si elle est entière.
  const moisAvant = avecDonnees(plan.precedent);
  const comparaisonPartielle = moisAvant && plan.precedent.debut < debutDonnees!;
  const comparer = moisAvant && !comparaisonPartielle;
  const t = total(0);
  const tAvant = total(1);
  const n = noms(plan, debutExercice);
  const ec = (v: string | null) => (comparer ? (v ?? "—") : "—");

  const points = (valeur: (m: Mesures) => number | null): PointCourbe[] =>
    plan.axe.map((m, k) => {
      const per = plan.serie[k];
      const avant = serieAvant[k];
      return {
        cle: m,
        libelle: moisAnnee(`${m}-01`),
        court: moisCourt.format(versDate(`${m}-01`)),
        actuel: per && avecDonnees(per) ? valeur(total(iSerie(k))) : null,
        avant: moisAvant && avant && avecDonnees(avant) ? valeur(total(iAvant(k))) : null,
        libelleAvant: avant ? moisAnnee(avant.debut) : undefined,
        enCours: !!per && per.fin >= jour,
      };
    });
  const deuxSeries = plan.vue !== "mois" && moisAvant;
  const surtitre = `${n.actuel}${plan.enCours ? ` · jusqu'au ${dateCourte(jour)}` : ""}${comparer ? ` · comparé à ${n.avantCourt}${plan.enCours ? " à la même date" : ""}` : ""}`;

  return (
    <>
      <Bandeau surtitre={surtitre} titre="Bilan de l'équipe">
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
        <div className="ligne-actions bilan-periode">
          <nav className="zoom" aria-label="Période">
            {VUES_BILAN.map((v) => (
              <a key={v.id} href={lien(v.id)} aria-current={plan.vue === v.id ? "true" : undefined}>
                {v.libelle}
              </a>
            ))}
          </nav>
          <nav className="bilan-periode__nav" aria-label="Autre période">
            <a href={lien(plan.vue, plan.avant)} className="bouton-icone" aria-label="Période précédente" title="Période précédente">
              <Icone nom="chevron-gauche" taille={20} />
            </a>
            <span>
              {n.actuel}
              {comparer ? <span className="ton-discret"> vs {n.avantCourt}</span> : null}
            </span>
            {plan.apres ? (
              <a href={lien(plan.vue, plan.apres)} className="bouton-icone" aria-label="Période suivante" title="Période suivante">
                <Icone nom="chevron-droite" taille={20} />
              </a>
            ) : null}
          </nav>
        </div>
        {comparaisonPartielle ? (
          <p className="note">
            L&apos;application n&apos;a pas de données avant le {dateCourte(debutDonnees!)} {debutDonnees!.slice(0, 4)} : les totaux ne se comparent pas encore à {n.avantCourt} ; les mois déjà renseignés sont en pointillé.
          </p>
        ) : !comparer ? (
          <p className="note">
            {debutDonnees ? `L'application n'a pas de données avant le ${dateCourte(debutDonnees)} ${debutDonnees.slice(0, 4)} : rien à comparer pour cette période.` : "L'application n'a pas encore de données."}
          </p>
        ) : plan.enCours ? (
          <p className="note">
            Période en cours : comparée à la même date ({dateCourte(plan.precedent.debut)} – {dateCourte(plan.precedent.fin)} {plan.precedent.fin.slice(0, 4)}), pour que les totaux se comparent.
          </p>
        ) : null}

        <section aria-labelledby="bilan-evolution">
          <h2 id="bilan-evolution" className="visuellement-cache">
            Évolution mois par mois
          </h2>
          <div className="bilan-graphes">
            {MESURES.map((m) => (
              <article key={m.id} className="carte graphe-carte">
                <header className="graphe-carte__tete">
                  <h3 className="graphe-carte__titre">{m.titre}</h3>
                  <p className="graphe-carte__valeur">
                    {valeurTexte(m.valeur(t), m.unite)}
                    {comparer ? (
                      <span className="graphe-carte__ecart">
                        {m.ecart(t, tAvant) ?? "—"} par rapport à {n.avantCourt}
                      </span>
                    ) : null}
                  </p>
                </header>
                <Courbes titre={`${m.titre}, mois par mois`} points={points(m.valeur)} unite={m.unite} nomActuel={n.actuel} nomAvant={deuxSeries ? n.avant : undefined} />
              </article>
            ))}
            <article className="carte graphe-carte">
              <header className="graphe-carte__tete">
                <h3 className="graphe-carte__titre">Rapports du vendredi</h3>
              </header>
              <Jauge
                part={partRapports(t)}
                texte={t.rapportsAttendus ? `des rapports attendus envoyés (${t.rapportsEnvoyes} sur ${t.rapportsAttendus})` : "aucun rapport attendu sur la période"}
                sous={comparer && tAvant.rapportsAttendus ? `${ecart(partRapports(t), partRapports(tAvant), " pts") ?? "—"} par rapport à ${n.avantCourt}` : null}
              />
              <Courbes titre="Rapports envoyés, mois par mois" points={points(partRapports)} unite="pourcent" nomActuel={n.actuel} nomAvant={deuxSeries ? n.avant : undefined} hauteur={90} />
            </article>
          </div>
          <details className="carte" style={{ marginTop: 16 }}>
            <summary className="lien-discret" style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>
              Voir les chiffres mois par mois
            </summary>
            <div className="defile-x">
              <table className="comparaison bilan-valeurs" style={{ minWidth: 640, marginTop: 8 }}>
                <thead>
                  <tr>
                    <th scope="col">Mois</th>
                    <th scope="col">Tâches terminées</th>
                    <th scope="col">Heures livrées</th>
                    <th scope="col">À temps</th>
                    <th scope="col">Part en réunion</th>
                    <th scope="col">Rapports envoyés</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.axe.map((m, k) => {
                    const per = plan.serie[k];
                    const avant = serieAvant[k];
                    const x = per && avecDonnees(per) ? total(iSerie(k)) : null;
                    const y = moisAvant && avant && avecDonnees(avant) ? total(iAvant(k)) : null;
                    const cellule = (f: (v: Mesures) => number | null, unite: Unite) => (
                      <td>
                        {x ? valeurTexte(f(x), unite) : "—"}
                        {plan.vue !== "mois" && moisAvant ? <small>{y ? `${valeurTexte(f(y), unite)} en ${moisAnnee(avant!.debut)}` : "—"}</small> : null}
                      </td>
                    );
                    return (
                      <tr key={m}>
                        <th scope="row">
                          {majuscule(moisAnnee(`${m}-01`))}
                          {per && per.fin >= jour ? <small>en cours</small> : null}
                        </th>
                        {cellule((v) => v.taches, "nombre")}
                        {cellule((v) => v.heures, "heures")}
                        {cellule((v) => v.aLHeure, "pourcent")}
                        {cellule((v) => v.partReunion, "pourcent")}
                        {cellule(partRapports, "pourcent")}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
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
                <table className="comparaison" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th scope="col">Personne</th>
                      <th scope="col">Tâches terminées</th>
                      <th scope="col">Heures livrées</th>
                      <th scope="col">À temps</th>
                      <th scope="col">En réunion</th>
                      <th scope="col">Rapports</th>
                      <th scope="col">Tâches par mois</th>
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
                              <a href={`/bilan?personne=${x.id}`} className="lien-discret">
                                Semaine par semaine
                              </a>
                            </small>
                          </th>
                          <Cellules m={de(x.id, 0)} avant={de(x.id, 1)} comparer={comparer} />
                          <td className="comparaison__tendance">
                            {/* Chacun comparé à lui-même : sa propre courbe, jamais côte à côte avec les autres. */}
                            <Tendance valeurs={plan.serie.map((per, k) => (avecDonnees(per) ? de(x.id, iSerie(k)).taches : null))} libelles={plan.serie.map((per) => moisAnnee(per.debut))} unite="nombre" />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {g.personnes.length > 1 ? (
                    <tfoot>
                      <tr>
                        <th scope="row">Ensemble · {g.personnes.length}</th>
                        <Cellules m={total(0, qui)} avant={total(1, qui)} comparer={comparer} />
                        <td className="comparaison__tendance">
                          <Tendance valeurs={plan.serie.map((per, k) => (avecDonnees(per) ? total(iSerie(k), qui).taches : null))} libelles={plan.serie.map((per) => moisAnnee(per.debut))} unite="nombre" />
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
          {comparer ? `Sous chaque chiffre, l'écart avec ${n.avantCourt}. ` : ""}Ces chiffres décrivent ce qui est enregistré dans l&apos;application (tâches marquées faites, une tâche sans estimation comptant pour 4 h ; réunions notées ; rapports envoyés). Ils ne mesurent ni la
          qualité du travail ni ce qui n&apos;est pas noté : ils servent à ouvrir une conversation avec la personne, pas à la classer. C&apos;est pourquoi chacun n&apos;est comparé qu&apos;à lui-même.
        </p>
      </div>
    </>
  );
}
