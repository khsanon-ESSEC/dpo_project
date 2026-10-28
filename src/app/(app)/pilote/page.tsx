import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerInterne } from "@/lib/auth/session";
import { ajouterJours, dateCourte } from "@/lib/dates";
import { suiviPilote } from "@/lib/donnees/pilote";
import { courrielActif } from "@/lib/courriel";
import { bilanCourriels } from "@/lib/donnees/courriels";
import { semaineCourante } from "@/lib/donnees/rapport";
import { Bandeau } from "@/components/Bandeau";
import { ONGLETS_ORGANISATION, SousOnglets } from "@/components/SousOnglets";
import { Courbes, valeurTexte } from "@/components/Courbes";
import { debutDesDonnees } from "@/lib/donnees/bilan";

export const metadata: Metadata = { title: "Suivi du pilote" };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

/**
 * Suivi du pilote, pour les administrateurs et les exécutifs : l'application est-elle utilisée ?
 * Des nombres agrégés seulement : personne n'est suivi individuellement ici.
 */
export default async function PagePilote() {
  const u = await exigerInterne();
  if (!u.administrateur && !u.executif) notFound();
  const [s, debuts] = await Promise.all([suiviPilote(), debutDesDonnees()]);
  // Avant que l'application serve (premier rapport, première donnée), une semaine n'a pas de valeur, pas un zéro.
  const servait = (w: { lundi: string }, depuis: string | null) => !!depuis && ajouterJours(w.lundi, 6) >= depuis;
  // Les mises à jour et les ouvertures ne sont enregistrées que par l'application : avant la première, pas de valeur.
  const premiereVue = s.semaines.find((w) => w.actifs > 0)?.lundi ?? null;
  const premiereMaj = s.semaines.find((w) => w.tachesAJour > 0)?.lundi ?? null;
  const courriel = courrielActif() ? await bilanCourriels(semaineCourante()) : null;
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
      <div className="page" style={{ maxWidth: 980 }}>
        <SousOnglets onglets={u.administrateur ? ONGLETS_ORGANISATION : ONGLETS_ORGANISATION.filter((o) => o.href === "/organisation" || o.href === "/pilote")} courant="/pilote" label="Organisation" />
        <section aria-labelledby="p-tendances">
          <h2 id="p-tendances" className="carte__titre" style={{ marginBottom: 12 }}>
            Douze semaines
          </h2>
          <div className="bilan-graphes">
            {[
              { titre: "Rapports envoyés", valeur: (w: (typeof s.semaines)[number]) => (w.attendu && servait(w, debuts.rapports) ? pct(w.envoyes, w.redacteurs) : null) },
              { titre: "Rapports à l'heure", valeur: (w: (typeof s.semaines)[number]) => (w.attendu && servait(w, debuts.rapports) ? pct(w.aLheure, w.redacteurs) : null) },
              { titre: "Tâches mises à jour avant vendredi", valeur: (w: (typeof s.semaines)[number]) => (premiereMaj && w.lundi >= premiereMaj ? pct(w.tachesAJour, w.redacteurs) : null) },
              { titre: "Personnes qui ont ouvert l'application", valeur: (w: (typeof s.semaines)[number]) => (premiereVue && w.lundi >= premiereVue ? pct(w.actifs, s.utilisateurs) : null) },
            ].map((m) => {
              const derniere = [...s.semaines].reverse().find((w) => m.valeur(w) !== null);
              return (
                <article key={m.titre} className="carte graphe-carte">
                  <header className="graphe-carte__tete">
                    <h3 className="graphe-carte__titre">{m.titre}</h3>
                    <p className="graphe-carte__valeur">
                      {valeurTexte(derniere ? m.valeur(derniere) : null, "pourcent")}
                      <span className="graphe-carte__ecart">{derniere ? `semaine du ${dateCourte(derniere.lundi)}` : "pas encore de semaine complète"}</span>
                    </p>
                  </header>
                  <Courbes
                    titre={`${m.titre}, semaine par semaine`}
                    unite="pourcent"
                    nomActuel={m.titre}
                    hauteur={100}
                    points={s.semaines.map((w) => ({ cle: w.lundi, libelle: `semaine du ${dateCourte(w.lundi)}`, court: dateCourte(w.lundi), actuel: m.valeur(w), avant: null, enCours: w.courante }))}
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
              {courriel.envoyes} courriel{courriel.envoyes > 1 ? "s" : ""} envoyé{courriel.envoyes > 1 ? "s" : ""} (« prêt à relire » et rappels)
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
        <p className="note">
          Les écrans sont notés « telle personne a ouvert tel écran tel jour », sans durée ni contenu, et ne s&apos;affichent ici qu&apos;en nombres. Les rapports en retard de chacun restent dans Équipe, pour son chef.
        </p>
      </div>
    </>
  );
}
