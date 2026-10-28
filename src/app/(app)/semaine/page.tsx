import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth/session";
import { redigeUnRapport } from "@/lib/regles";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ajouterJours, aujourdhui, dateCourte, heure, jourComplet, lettreJour, lundiDe } from "@/lib/dates";
import { activiteDeLaSemaine, compter, etatMonRapport, journeeDe, mesProjets, tachesDe } from "@/lib/donnees/semaine";
import { semaineCourante } from "@/lib/donnees/rapport";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { Jauge } from "@/components/Charge";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_SEMAINE, SousOnglets } from "@/components/SousOnglets";
import { reunionsDe } from "@/lib/donnees/reunions";
import { dureeTexte } from "@/lib/projets";

export const metadata: Metadata = { title: "Ma semaine" };

const SANTE = {
  en_retard: { texte: "En retard", classe: "ton-retard" },
  a_surveiller: { texte: "À surveiller", classe: "ton-veille" },
  dans_les_temps: { texte: "Dans les temps", classe: "ton-ok" },
} as const;

export default async function PageSemaine({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const { jour: jourDemande } = await searchParams;
  const u = await exigerUtilisateur();
  const jour = aujourdhui();
  const semaine = semaineCourante();
  // Un jour choisi dans la frise (passé ou non) : sa semaine s'affiche, et ce qui s'y est passé.
  const choisi = jourDemande && /^\d{4}-\d{2}-\d{2}$/.test(jourDemande) && !Number.isNaN(Date.parse(jourDemande)) ? jourDemande : null;
  const semaineVue = lundiDe(choisi ?? jour);
  // Le jour montré : celui choisi dans la frise, sinon aujourd'hui. La liste des tâches est dans « À faire ».
  const jourVu = choisi ?? jour;
  const [taches, jours, projets, rapport, maCharge, journee, rapportVu, reunions] = await Promise.all([
    tachesDe([u.id]),
    activiteDeLaSemaine(u.id, semaineVue),
    mesProjets(u.id),
    etatMonRapport(u.id),
    chargeDesPersonnes([u.id], 2),
    journeeDe(u.id, jourVu),
    semaineVue !== semaine
      ? db
          .select({ id: schema.rapportsHebdo.id, statut: schema.rapportsHebdo.statut })
          .from(schema.rapportsHebdo)
          .where(and(eq(schema.rapportsHebdo.auteurId, u.id), eq(schema.rapportsHebdo.semaine, semaineVue)))
          .then((r) => r[0] ?? null)
      : null,
    reunionsDe(u.id, semaineVue, ajouterJours(semaineVue, 6)),
  ]);
  const minutesReunion = reunions.reduce((t, r) => t + r.dureeMinutes, 0);
  const reunionsDuJour = reunions.filter((r) => r.jour === jourVu);
  const charge = maCharge.lignes[0]?.charge;
  const c = compter(taches, jour);
  const envoye = rapport.rapport?.statut === "envoye";

  return (
    <>
      <Bandeau surtitre={jourComplet(jour)} titre="Ma semaine">
        <div className="chiffres">
          <Anneau fait={c.faites} total={c.total} legende="faites" label={`${c.faites} tâches terminées sur ${c.total}`} />
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 48px" }}>
            <div className="chiffre chiffre--retard">
              <dt>en retard</dt>
              <dd>{c.retard}</dd>
            </div>
            <div className="chiffre">
              <dt>{c.bloquees > 1 ? "bloquées" : "bloquée"}</dt>
              <dd>{c.bloquees}</dd>
            </div>
            <div className="chiffre">
              <dt>à faire</dt>
              <dd>{c.aFaire}</dd>
            </div>
          </dl>
        </div>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_SEMAINE} courant="/semaine" label="Ma semaine" />
        <nav className="frise-semaine" aria-label="Semaines">
          <a href={`/semaine?jour=${ajouterJours(semaineVue, -7)}`} className="bouton-icone" aria-label="Semaine précédente" title="Semaine précédente">
            <Icone nom="chevron-gauche" taille={20} />
          </a>
          <ol className="frise" aria-label={`Semaine du ${dateCourte(semaineVue)} : choisissez un jour pour voir ce qui s'y est passé`}>
            {jours.map((j) => (
              <li key={j.jour} aria-current={j.jour === jour ? "date" : undefined} data-choisi={j.jour === jourVu ? "1" : undefined}>
                <a href={j.jour === jour ? "/semaine" : `/semaine?jour=${j.jour}`} aria-label={`${jourComplet(j.jour)} : ${j.total} mise${j.total > 1 ? "s" : ""} à jour`} aria-pressed={j.jour === jourVu}>
                  <span className="frise__lettre" aria-hidden="true">
                    {lettreJour(j.jour)}
                  </span>
                  <span className="frise__date" aria-hidden="true">
                    {Number(j.jour.slice(8))}
                  </span>
                  <span className="frise__points" aria-hidden="true">
                    {Array.from({ length: j.n }, (_, i) => (
                      <span key={i} />
                    ))}
                  </span>
                </a>
              </li>
            ))}
          </ol>
          {semaineVue < semaine ? (
            <a href={`/semaine?jour=${ajouterJours(semaineVue, 7)}`} className="bouton-icone" aria-label="Semaine suivante" title="Semaine suivante">
              <Icone nom="chevron-droite" taille={20} />
            </a>
          ) : (
            <span className="bouton-icone" aria-hidden="true" style={{ visibility: "hidden" }} />
          )}
        </nav>
        {semaineVue !== semaine ? (
          <p className="note" style={{ margin: "-8px 0 0", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            <span>Semaine du {dateCourte(semaineVue)} au {dateCourte(ajouterJours(semaineVue, 4))}.</span>
            {rapportVu ? (
              <a href={rapportVu.statut === "envoye" ? `/rapports/${rapportVu.id}` : "/rapport"} className="lien-discret">
                Voir mon rapport de cette semaine →
              </a>
            ) : null}
            <a href="/semaine" className="lien-discret">
              Revenir à cette semaine →
            </a>
          </p>
        ) : null}
        <div className="colonnes">
          <section className="carte carte--liste colonne-large" aria-labelledby="t-journee">
            <div className="carte__entete">
              <h2 id="t-journee" className="carte__titre">
                {jourVu === jour ? "Aujourd'hui · " : ""}
                {jourComplet(jourVu)}
              </h2>
              {jourVu !== jour ? (
                <a href="/semaine" className="lien-discret">
                  Revenir à aujourd&apos;hui
                </a>
              ) : (
                <a href="/a-faire" className="lien-discret">
                  Mes tâches →
                </a>
              )}
            </div>
            {journee.faits.length === 0 && journee.echeances.length === 0 && reunionsDuJour.length === 0 ? <p className="vide">Aucune mise à jour de tâche ce jour-là, aucune échéance, aucune réunion.</p> : null}
            {journee.faits.length ? (
              <ul className="liste">
                {journee.faits.map((f) => (
                  <li key={f.id}>
                    <a href={`/taches/${f.tacheId}`} className="rangee" style={{ minHeight: 52 }}>
                      <span className="rangee__meta" style={{ flex: "0 0 64px", fontVariantNumeric: "tabular-nums" }}>
                        {heure(f.heure)}
                      </span>
                      {f.projetCode ? <span className="etiquette-projet">{f.projetCode}</span> : null}
                      <span className="rangee__texte">
                        <span className="rangee__titre" style={{ whiteSpace: "normal" }}>
                          {f.texte}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {reunionsDuJour.length ? (
              <>
                <h3 style={{ margin: "14px 0 4px", fontSize: 13, fontWeight: 500 }}>Réunions · {dureeTexte(reunionsDuJour.reduce((t, r) => t + r.dureeMinutes, 0))}</h3>
                <ul className="liste">
                  {reunionsDuJour.map((r) => (
                    <li key={r.id}>
                      <a href={`/reunions?semaine=${semaineVue}`} className="rangee" style={{ minHeight: 48 }}>
                        <span className="rangee__meta" style={{ flex: "0 0 64px", fontVariantNumeric: "tabular-nums" }}>
                          {r.heure ? r.heure.replace(":", " h ") : "—"}
                        </span>
                        {r.projetCode ? <span className="etiquette-projet">{r.projetCode}</span> : null}
                        <span className="rangee__texte">
                          <span className="rangee__titre">{r.titre}</span>
                        </span>
                        <span className="rangee__meta">{dureeTexte(r.dureeMinutes)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {journee.echeances.length ? (
              <>
                <h3 style={{ margin: "14px 0 4px", fontSize: 13, fontWeight: 500 }}>Échéances ce jour-là</h3>
                <ul className="liste">
                  {journee.echeances.map((t) => (
                    <li key={t.id}>
                      <a href={`/taches/${t.id}`} className="rangee" style={{ minHeight: 48 }}>
                        {t.projetCode ? <span className="etiquette-projet">{t.projetCode}</span> : null}
                        <span className="rangee__texte">
                          <span className="rangee__titre">{t.titre}</span>
                        </span>
                        <span className={`rangee__meta ${t.statut === "faite" ? "ton-ok" : t.statut === "bloquee" ? "ton-veille" : jourVu < jour ? "ton-retard" : ""}`}>{t.libelle}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
          <div className="colonne-etroite">
{redigeUnRapport(u) ? (
            <section className="carte" aria-labelledby="t-rapport" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="carte__entete" style={{ margin: 0 }}>
                <h2 id="t-rapport" className="carte__titre">
                  Rapport du vendredi
                </h2>
                <a href="/rapports" className="lien-discret">
                  Mes rapports →
                </a>
              </div>
              <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 200 }}>{envoye ? "Envoyé" : "Brouillon prêt"}</span>
              <span className="note">{rapport.superieur ? `Pour ${rapport.superieur}` : "Aucun supérieur désigné"}</span>
              <a href="/rapport" className={envoye ? "bouton-contour" : "bouton-ambre"} style={{ alignSelf: "flex-start", marginTop: 6 }}>
                {envoye ? "Revoir" : "Relire et envoyer"}
              </a>
            </section>
            ) : null}
            {charge ? (
              <section className="carte" aria-labelledby="t-charge">
                <div className="carte__entete">
                  <h2 id="t-charge" className="carte__titre">
                    Ma charge
                  </h2>
                  <a href={`/equipe/${u.id}`} className="lien-discret">
                    Détail →
                  </a>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 12 }}>
                  {charge.semaines.map((w, i) => (
                    <div key={w.semaine} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span className="rangee__sous">{i === 0 ? "Reste de la semaine" : "Semaine prochaine"}</span>
                      <Jauge heures={w.heures} capacite={w.capacite} niveau={w.niveau} lien={`/equipe/${u.id}?semaine=${w.semaine}`} delai={i * 80} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="carte" aria-labelledby="t-reunions" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="carte__entete" style={{ margin: 0 }}>
                <h2 id="t-reunions" className="carte__titre">
                  Réunions {semaineVue === semaine ? "cette semaine" : `semaine du ${dateCourte(semaineVue)}`}
                </h2>
                <a href={`/reunions?semaine=${semaineVue}`} className="lien-discret">
                  Détail →
                </a>
              </div>
              <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 200 }}>
                {minutesReunion ? dureeTexte(minutesReunion) : "Aucune"}
                {reunions.length ? <small style={{ fontSize: 14, marginLeft: 8 }} className="ton-discret">{reunions.length} réunion{reunions.length > 1 ? "s" : ""}</small> : null}
              </span>
              <a href={`/reunions?semaine=${semaineVue}#noter`} className="bouton-contour" style={{ alignSelf: "flex-start" }}>
                <Icone nom="ajouter" taille={16} /> Noter une réunion
              </a>
            </section>
            <section className="carte carte--liste" aria-labelledby="t-projets">
              <h2 id="t-projets" className="carte__titre">
                Mes projets
              </h2>
              {projets.length === 0 ? <p className="vide">Aucun projet.</p> : null}
              <ul className="liste">
                {projets.map((p) => (
                  <li key={p.id}>
                    <a href={`/projets/${p.id}`} className="rangee" style={{ minHeight: 68, gap: 16 }}>
                      <Anneau fait={p.atteints} total={p.totalIndicateurs} taille={44} label={`${p.atteints} indicateurs atteints sur ${p.totalIndicateurs}`} />
                      <span className="rangee__texte">
                        <span className="rangee__titre" style={{ whiteSpace: "nowrap" }}>
                          {p.titre}
                        </span>
                        <span className={`statut ${SANTE[p.sante].classe}`} style={{ fontSize: 12, fontWeight: 400 }}>
                          {SANTE[p.sante].texte}
                        </span>
                      </span>
                      <span className="rangee__meta" style={{ fontSize: 12 }}>
                        {p.role}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
