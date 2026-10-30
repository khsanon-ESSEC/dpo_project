import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigerInterne } from "@/lib/auth/session";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { piloteParPeriode, suiviPilote } from "@/lib/donnees/pilote";
import { courrielActif } from "@/lib/courriel";
import { bilanCourriels } from "@/lib/donnees/courriels";
import { semaineCourante } from "@/lib/donnees/rapport";
import { Bandeau } from "@/components/Bandeau";
import { ongletsOrganisation, SousOnglets } from "@/components/SousOnglets";
import { acces } from "@/lib/acces";
import { Courbes, valeurTexte } from "@/components/Courbes";
import { debutDesDonnees } from "@/lib/donnees/bilan";
import { ecart, moisDebutExercice, planBilan } from "@/lib/bilan";
import { aLa, etiquettesAxe, nomsDesPeriodes } from "@/lib/bilan-libelles";
import { periodePreferee } from "@/lib/periode-preferee";
import { ChoixPeriode } from "@/components/ChoixPeriode";
import { suiviDuGuide } from "@/lib/donnees/guide";

export const metadata: Metadata = { title: "Suivi du pilote" };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

/**
 * Suivi du pilote, pour les administrateurs et les exécutifs : l'application est-elle utilisée ?
 * Des nombres agrégés seulement : personne n'est suivi individuellement ici.
 */
export default async function PagePilote({ searchParams }: { searchParams: Promise<{ vue?: string; p?: string }> }) {
  const u = await exigerInterne();
  if (!u.administrateur && !u.executif) notFound();
  const { vue, p: periode } = await searchParams;
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  const plan = planBilan(vue ?? (await periodePreferee("semaine")), periode, aujourdhui(), debutExercice);
  const [s, debuts, guide] = await Promise.all([suiviPilote(), debutDesDonnees(), suiviDuGuide(new Date(Date.now() - 30 * 86400000))]);
  const valeurs = await piloteParPeriode([plan.actuel, plan.precedent, ...plan.serie, ...(plan.serieAvant ?? [])], debuts.rapports);
  const nomsPeriode = nomsDesPeriodes(plan, debutExercice);
  const etiquettes = etiquettesAxe(plan);
  const comparer = Object.values(valeurs[1]).some((v) => v !== null);
  const deuxSeries = !!plan.serieAvant && comparer;
  const courriel = courrielActif() ? await bilanCourriels(semaineCourante()) : null;
  const [{ n: inscritsLundi }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.personnes)
    .where(and(eq(schema.personnes.actif, true), eq(schema.personnes.courrielLundi, true)));
  const derniere = [...s.semaines].reverse().find((w) => w.attendu);

  const Barre = ({ valeur, total, etiquette }: { valeur: number; total: number; etiquette: string }) => {
    const p = pct(valeur, total);
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span aria-hidden="true" style={{ flex: "1 1 80px", maxWidth: 160, height: 8, background: "var(--piste)", position: "relative" }}>
          <span style={{ position: "absolute", inset: 0, width: `${p ?? 0}%`, background: (p ?? 0) >= 80 ? "var(--ok-point)" : (p ?? 0) >= 50 ? "var(--veille-point)" : "var(--retard-point)" }} />
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }} aria-label={etiquette}>
          {p === null ? "—" : `${p} %`} <span className="ton-discret">({valeur}/{total})</span>
        </span>
      </span>
    );
  };

  return (
    <>
      <Bandeau surtitre="Pilote · adoption de l'application" titre="Suivi du pilote">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>rapports à l&apos;heure, dernière semaine</dt>
            <dd>
              {derniere ? (pct(derniere.aLheure, derniere.redacteurs) ?? 0) : "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
          <div className="chiffre">
            <dt>ont mis à jour une tâche avant vendredi</dt>
            <dd>
              {derniere ? (pct(derniere.tachesAJour, derniere.redacteurs) ?? 0) : "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
          <div className="chiffre">
            <dt>personnes actives, 4 semaines</dt>
            <dd>
              {s.actifs}
              <small>&nbsp;/ {s.utilisateurs}</small>
            </dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ongletsOrganisation(u, (await acces(u)).toutVoir)} courant="/pilote" label="Organisation" />
        <section aria-labelledby="p-tendances" id="tendances" style={{ scrollMarginTop: 80 }}>
          <h2 id="p-tendances" className="carte__titre" style={{ marginBottom: 12 }}>
            Adoption
          </h2>
          <ChoixPeriode plan={plan} noms={nomsPeriode} lien={(v, pp) => `/pilote?vue=${v}${pp ? `&p=${pp}` : ""}#tendances`} comparer={comparer} />
          <div className="bilan-graphes">
            {[
              { titre: "Rapports envoyés", cle: "envoyes" as const },
              { titre: "Rapports à l'heure", cle: "aLheure" as const },
              { titre: "Tâches mises à jour avant vendredi", cle: "tachesAJour" as const },
              { titre: "Personnes qui ont ouvert l'application", cle: "ouverts" as const },
            ].map((m) => {
              const actuel = valeurs[0][m.cle];
              const avant = valeurs[1][m.cle];
              return (
                <article key={m.titre} className="carte graphe-carte">
                  <header className="graphe-carte__tete">
                    <h3 className="graphe-carte__titre">{m.titre}</h3>
                    <p className="graphe-carte__valeur">
                      {valeurTexte(actuel, "pourcent")}
                      <span className="graphe-carte__ecart">{comparer && avant !== null ? `${ecart(actuel, avant, " pts") ?? "—"} par rapport ${aLa(nomsPeriode.avantCourt)}` : nomsPeriode.actuel}</span>
                    </p>
                  </header>
                  <Courbes
                    titre={`${m.titre}, ${plan.vue === "semaine" ? "semaine par semaine" : "mois par mois"}`}
                    unite="pourcent"
                    nomActuel={nomsPeriode.actuel}
                    nomAvant={deuxSeries ? nomsPeriode.avant : undefined}
                    hauteur={100}
                    points={plan.axe.map((cle, k) => ({
                      cle,
                      libelle: etiquettes[k].libelle,
                      court: etiquettes[k].court,
                      actuel: k < plan.serie.length ? valeurs[2 + k][m.cle] : null,
                      avant: deuxSeries ? valeurs[2 + plan.serie.length + k][m.cle] : null,
                      libelleAvant: etiquettes[k].libelleAvant,
                      enCours: !!plan.serie[k] && plan.serie[k].fin >= aujourdhui(),
                    }))}
                  />
                </article>
              );
            })}
          </div>
        </section>

        <section className="carte" aria-labelledby="p-semaines">
          <h2 id="p-semaines" className="carte__titre">
            Semaine par semaine
          </h2>
          <p className="note" style={{ margin: "4px 0 12px" }}>
            Sur les {s.semaines[0]?.redacteurs ?? 0} personnes qui rédigent un rapport (ni exécutifs, ni personnes hors division). « À l&apos;heure » : avant l&apos;heure limite du modèle de rapport de chacun.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="tableau-simple">
              <thead>
                <tr>
                  <th scope="col">Semaine du</th>
                  <th scope="col">Rapports envoyés</th>
                  <th scope="col">dont à l&apos;heure</th>
                  <th scope="col">Tâches mises à jour (lundi → vendredi)</th>
                </tr>
              </thead>
              <tbody>
                {s.semaines.slice(-6).map((w) => (
                  <tr key={w.lundi}>
                    <th scope="row">
                      {dateCourte(w.lundi)}
                      {w.enCours ? <span className="ton-discret"> · en cours</span> : null}
                    </th>
                    <td>{w.attendu || w.envoyes ? <Barre valeur={w.envoyes} total={w.redacteurs} etiquette={`${w.envoyes} rapports envoyés sur ${w.redacteurs}`} /> : <span className="ton-discret">attendus vendredi</span>}</td>
                    <td>{w.attendu || w.envoyes ? <Barre valeur={w.aLheure} total={w.redacteurs} etiquette={`${w.aLheure} rapports à l'heure sur ${w.redacteurs}`} /> : "—"}</td>
                    <td>
                      <Barre valeur={w.tachesAJour} total={w.redacteurs} etiquette={`${w.tachesAJour} personnes sur ${w.redacteurs}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="carte" aria-labelledby="p-courriels">
          <h2 id="p-courriels" className="carte__titre">
            Rappels par courriel · cette semaine
          </h2>
          {courriel ? (
            <p style={{ margin: "4px 0 0" }}>
              {courriel.envoyes} courriel{courriel.envoyes > 1 ? "s" : ""} envoyé{courriel.envoyes > 1 ? "s" : ""} (« prêt à relire », rappels et courriel du lundi)
              {courriel.erreurs ? (
                <span className="ton-retard">
                  {" "}
                  · {courriel.erreurs} en erreur, retenté{courriel.erreurs > 1 ? "s" : ""} toutes les vingt minutes : vérifier le serveur de courriel (SMTP_*) et les adresses des personnes.
                </span>
              ) : null}
            </p>
          ) : (
            <p className="note" style={{ margin: "4px 0 0" }}>
              Pas de courriel : le serveur de courriel n&apos;est pas configuré (SMTP_HOTE, SMTP_EXPEDITEUR, APP_URL). Les alertes dans l&apos;application restent.
            </p>
          )}
          <p className="note" style={{ margin: "6px 0 0" }}>
            Courriel du lundi : {inscritsLundi} personne{inscritsLundi > 1 ? "s l'ont demandé" : " l'a demandé"} dans {inscritsLundi > 1 ? "leur" : "son"} profil.
          </p>
        </section>

        <section className="carte carte--liste" aria-labelledby="p-ecrans">
          <h2 id="p-ecrans" className="carte__titre">
            Écrans ouverts · depuis le {dateCourte(s.depuis)}
          </h2>
          <p className="note" style={{ margin: "4px 0 8px" }}>
            Nombre de personnes différentes qui ont ouvert chaque écran, du moins utilisé au plus utilisé : ce qui sert peu est à simplifier ou à retirer. Les écrans jamais ouverts n&apos;apparaissent pas.
          </p>
          {s.ecrans.length === 0 ? (
            <p className="vide">Rien encore : les écrans ouverts sont comptés à partir de la mise en service de ce suivi.</p>
          ) : (
            <ul className="liste">
              {s.ecrans.map((e) => (
                <li key={e.ecran} className="rangee" style={{ minHeight: 48 }}>
                  <span className="rangee__texte">
                    <span className="rangee__titre">{e.libelle}</span>
                  </span>
                  <span className="rangee__meta" style={{ width: "min(260px, 50%)" }}>
                    <Barre valeur={e.personnes} total={s.utilisateurs} etiquette={`${e.personnes} personnes sur ${s.utilisateurs}`} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="carte carte--liste" aria-labelledby="p-guide">
          <h2 id="p-guide" className="carte__titre">
            Guide · questions restées sans réponse · 30 derniers jours
          </h2>
          <p className="note" style={{ margin: "4px 0 8px" }}>
            Les questions posées au guide auxquelles aucune fiche n&apos;a répondu : des fiches à écrire, ou des écrans à rendre plus clairs. Sans le nom de qui les a posées ; les noms de personnes, courriels et numéros y sont retirés.
          </p>
          {guide.sansReponse.length === 0 ? (
            <p className="vide">Aucune pour le moment.</p>
          ) : (
            <ul className="liste">
              {guide.sansReponse.map((q) => (
                <li key={q.texte} className="rangee" style={{ minHeight: 48 }}>
                  <span className="rangee__texte">
                    <span className="rangee__titre">« {q.texte} »</span>
                  </span>
                  <span className="rangee__meta">{q.fois > 1 ? `${q.fois} fois` : "1 fois"}</span>
                </li>
              ))}
            </ul>
          )}
          {guide.fiches.length ? (
            <>
              <h3 className="carte__titre" style={{ marginTop: 20 }}>
                Fiches les plus ouvertes
              </h3>
              <ul className="liste">
                {guide.fiches.map((f) => (
                  <li key={f.id}>
                    <a href={`/aide/${f.id}`} className="rangee" style={{ minHeight: 48 }}>
                      <span className="rangee__texte">
                        <span className="rangee__titre">{f.titre}</span>
                      </span>
                      <span className="rangee__meta">{f.fois} fois</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <p className="note">
          Les écrans sont notés « telle personne a ouvert tel écran tel jour », sans durée ni contenu, et ne s&apos;affichent ici qu&apos;en nombres. Les rapports en retard de chacun restent dans Équipe, pour son chef.
        </p>
      </div>
    </>
  );
}
