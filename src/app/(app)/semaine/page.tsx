import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, echeanceRelative, jourComplet, lettreJour } from "@/lib/dates";
import { activiteDeLaSemaine, compter, etatMonRapport, mesProjets, tachesDe, trier } from "@/lib/donnees/semaine";
import { semaineCourante } from "@/lib/donnees/rapport";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { Jauge } from "@/components/Charge";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { CaseTache } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Ma semaine" };

const SANTE = {
  en_retard: { texte: "En retard", classe: "ton-retard" },
  a_surveiller: { texte: "À surveiller", classe: "ton-veille" },
  dans_les_temps: { texte: "Dans les temps", classe: "ton-ok" },
} as const;

export default async function PageSemaine() {
  const u = await exigerUtilisateur();
  const jour = aujourdhui();
  const semaine = semaineCourante();
  const [taches, jours, projets, rapport, maCharge] = await Promise.all([
    tachesDe([u.id]),
    activiteDeLaSemaine(u.id, semaine),
    mesProjets(u.id),
    etatMonRapport(u.id),
    chargeDesPersonnes([u.id], 2),
  ]);
  const charge = maCharge.lignes[0]?.charge;
  const c = compter(taches, jour);
  const liste = trier(taches, jour);
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
        <ol className="frise" aria-label="Activité de la semaine">
          {jours.map((j) => (
            <li key={j.jour} aria-current={j.jour === jour ? "date" : undefined}>
              <span className="frise__lettre" aria-hidden="true">
                {lettreJour(j.jour)}
              </span>
              <span className="frise__date">{Number(j.jour.slice(8))}</span>
              <span className="frise__points" aria-label={`${j.n} mise${j.n > 1 ? "s" : ""} à jour`}>
                {Array.from({ length: j.n }, (_, i) => (
                  <span key={i} />
                ))}
              </span>
            </li>
          ))}
        </ol>
        <div className="colonnes">
          <section className="carte carte--liste colonne-large" aria-labelledby="t-afaire" style={{ gap: 0 }}>
            <div className="carte__entete">
              <h2 id="t-afaire" className="carte__titre">
                À faire · {c.total - c.faites}
              </h2>
              <a href="/taches/nouvelle" className="lien-discret" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36 }}>
                <Icone nom="ajouter" taille={16} /> Nouvelle tâche
              </a>
            </div>
            {liste.length === 0 ? (
              <p className="vide">Aucune tâche pour le moment.</p>
            ) : (
              <ul className="liste">
                {liste.map((t) => {
                  const e = echeanceRelative(t.echeance, jour);
                  const meta =
                    t.statut === "faite" ? { texte: "Faite", classe: "ton-discret" } : t.statut === "bloquee" ? { texte: "Bloquée", classe: "ton-veille" } : { texte: e.texte, classe: e.retard ? "ton-retard" : "ton-discret" };
                  return (
                    <CaseTache key={t.id} id={t.id} titre={t.titre} faite={t.statut === "faite"}>
                      <a href={`/taches/${t.id}`} className="rangee" style={{ flex: 1, minWidth: 0 }}>
                        {t.projetCode ? (
                          <span className="mono" aria-hidden="true">
                            {t.projetCode}
                          </span>
                        ) : null}
                        <span className="rangee__texte">
                          <span className="rangee__titre">{t.titre}</span>
                          <span className="rangee__sous">
                            {t.projetTitre ?? "Hors projet"} · <span className={meta.classe}>{meta.texte}</span>
                          </span>
                        </span>
                      </a>
                    </CaseTache>
                  );
                })}
              </ul>
            )}
          </section>
          <div className="colonne-etroite">
            <section className="carte" aria-labelledby="t-rapport" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 id="t-rapport" className="carte__titre" style={{ margin: 0 }}>
                Rapport du vendredi
              </h2>
              <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 200 }}>{envoye ? "Envoyé" : "Brouillon prêt"}</span>
              <span className="note">{rapport.superieur ? `Pour ${rapport.superieur}` : "Aucun supérieur désigné"}</span>
              <a href="/rapport" className={envoye ? "bouton-contour" : "bouton-ambre"} style={{ alignSelf: "flex-start", marginTop: 6 }}>
                {envoye ? "Revoir" : "Relire et envoyer"}
              </a>
            </section>
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
