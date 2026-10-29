import { PastilleStatut } from "@/components/PastilleStatut";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, dateLocale, dateLongue, echeanceRelative, heure } from "@/lib/dates";
import { histoireDuLivrable, livrablesDuProjet } from "@/lib/donnees/livrables";
import { phasesDuProjet } from "@/lib/donnees/risques";
import { LIBELLE_ETAT_LIVRABLE, peutDeclarerPret, peutGererProjet } from "@/lib/projets";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { agirLivrable } from "../../actions";

export const metadata: Metadata = { title: "Livrable" };

const FAIT: Record<string, string> = { pret: "Livrable déclaré prêt à valider.", valider: "Livrable validé.", renvoyer: "Livrable renvoyé à reprendre.", rouvrir: "Livrable rouvert." };

/** Un livrable et ses détails : ce qui le valide, les tâches qui y mènent, son histoire, et ce qu'on peut y faire. */
export default async function PageLivrable({ params, searchParams }: { params: Promise<{ id: string; livrableId: string }>; searchParams: Promise<{ erreur?: string; fait?: string }> }) {
  const { id, livrableId } = await params;
  const { erreur, fait } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(livrableId)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  // Mêmes droits que la fiche du projet : qui voit le projet voit ses livrables.
  await exigerProjetVisible(a, id);
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, id));
  const jour = aujourdhui();
  const { livrables } = await livrablesDuProjet(id, jour);
  const l = livrables.find((x) => x.id === livrableId);
  if (!p || !l) notFound();
  const phases = await phasesDuProjet(id);
  const phase = l.phaseId ? phases.find((x) => x.id === l.phaseId) : undefined;
  const gere = peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p);
  const actif = p.statut !== "requete" && p.statut !== "refuse" && !p.archiveLe;
  const responsable = l.responsableId === u.id;
  const peutPret = actif && peutDeclarerPret(u.id, l, gere && actif);
  const histoire = await histoireDuLivrable(l.id, l.taches.map((t) => t.id), new Map(l.taches.map((t) => [t.id, t.titre])));
  const ici = `/projets/${id}/livrables/${l.id}`;
  const heuresEstimees = l.taches.reduce((s, t) => s + (t.estimationHeures ?? 0), 0);
  const ordre = livrables.filter((x) => x.etat !== "atteint" || x.id === l.id);
  const rang = ordre.findIndex((x) => x.id === l.id);
  const precedent = rang > 0 ? ordre[rang - 1] : null;
  const suivant = rang >= 0 && rang < ordre.length - 1 ? ordre[rang + 1] : null;

  return (
    <>
      <Bandeau
        surtitre={`Livrable · ${p.code} · ${LIBELLE_ETAT_LIVRABLE[l.affiche]}`}
        titre={l.libelle}
        retour={
          <a href={`/projets/${id}#livrable-${l.id}`} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {p.titre}
          </a>
        }
      >
        <dl className="chiffres">
          <div className="chiffre">
            <Anneau fait={l.compte.faites} total={l.compte.total} legende="tâches" label={`${l.compte.faites} tâches faites sur ${l.compte.total}`} />
          </div>
          <div className={`chiffre ${l.enRetard ? "chiffre--retard" : ""}`}>
            <dt>{l.etat === "atteint" ? "validé le" : l.enRetard ? "en retard, prévu le" : "prévu le"}</dt>
            <dd style={{ fontSize: 28, lineHeight: "54px", fontWeight: 300 }}>{l.etat === "atteint" ? dateCourte(l.atteintLe) : l.prevuLe ? dateCourte(l.prevuLe) : "—"}</dd>
          </div>
          <div className="chiffre">
            <dt>responsable</dt>
            <dd style={{ fontSize: 22, lineHeight: "54px", fontWeight: 300 }}>{l.responsableId ? <LienPersonne id={l.responsableId}>{l.responsable}</LienPersonne> : "—"}</dd>
          </div>
          {heuresEstimees ? (
            <div className="chiffre">
              <dt>heures estimées</dt>
              <dd>
                {heuresEstimees}
                <small>&nbsp;h</small>
              </dd>
            </div>
          ) : null}
        </dl>
      </Bandeau>
      <div className="page">
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur.slice(0, 300)}
          </p>
        ) : fait && FAIT[fait] ? (
          <p className="succes" role="status">
            {FAIT[fait]}
          </p>
        ) : null}
        <nav className="ligne-actions" aria-label="Autres livrables du projet">
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {precedent ? (
              <a href={`/projets/${id}/livrables/${precedent.id}`} className="bouton-mini">
                <Icone nom="chevron-gauche" taille={14} /> {precedent.libelle}
              </a>
            ) : null}
            {suivant ? (
              <a href={`/projets/${id}/livrables/${suivant.id}`} className="bouton-mini">
                {suivant.libelle} <Icone nom="chevron-droite" taille={14} />
              </a>
            ) : null}
          </span>
          {gere ? (
            <a href={`/projets/${id}/livrables?ouvrir=${l.id}#livrable-${l.id}`} className="bouton-contour">
              <Icone nom="modifier" taille={16} /> Modifier le livrable
            </a>
          ) : null}
        </nav>
        <div className="volets">
          <div className="volets__partie">
            <section className="carte" aria-labelledby="lv-fiche" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 id="lv-fiche" className="carte__titre" style={{ margin: 0 }}>
                Le livrable
              </h2>
              <dl className="fiche-livrable">
                <div>
                  <dt>État</dt>
                  <dd className={l.affiche === "atteint" ? "ton-ok" : l.affiche === "pret" ? "ton-veille" : undefined}>
                    {l.affiche === "atteint" && l.atteintLe
                      ? `Validé le ${dateLongue(l.atteintLe)}${l.validePar ? ` par ${l.validePar}` : ""}`
                      : l.affiche === "pret" && l.pretLe
                        ? `Prêt à valider depuis le ${dateLongue(l.pretLe)}`
                        : LIBELLE_ETAT_LIVRABLE[l.affiche]}
                  </dd>
                </div>
                <div>
                  <dt>Prévu le</dt>
                  <dd className={l.enRetard ? "ton-retard" : undefined}>{l.prevuLe ? `${dateLongue(l.prevuLe)}${l.enRetard ? " (en retard)" : ""}` : "Sans date"}</dd>
                </div>
                <div>
                  <dt>Responsable</dt>
                  <dd>{l.responsableId ? <LienPersonne id={l.responsableId}>{l.responsable}</LienPersonne> : <span className="ton-veille">Sans responsable</span>}</dd>
                </div>
                <div>
                  <dt>Phase</dt>
                  <dd>{phase ? `${phase.nom}${phase.debut || phase.fin ? ` (${dateCourte(phase.debut)} → ${dateCourte(phase.fin)})` : ""}` : "—"}</dd>
                </div>
                <div className="fiche-livrable__large">
                  <dt>Validé quand</dt>
                  <dd>{l.critere || <span className="ton-discret">Pas de critère écrit : le chef de projet peut en ajouter un dans « Modifier le livrable ».</span>}</dd>
                </div>
              </dl>
              {l.remarque && l.etat !== "atteint" ? <p className="livrable__alerte livrable__alerte--retour">À reprendre : {l.remarque}</p> : null}
              {l.compte.apres ? (
                <p className="livrable__alerte">
                  {l.compte.apres} tâche{l.compte.apres > 1 ? "s" : ""} prévue{l.compte.apres > 1 ? "s" : ""} après le {dateCourte(l.prevuLe!)} : le livrable prendra du retard.
                </p>
              ) : null}
            </section>

            <section className="carte carte--liste" aria-labelledby="lv-taches">
              <div className="carte__entete">
                <h2 id="lv-taches" className="carte__titre">
                  Tâches qui y mènent · {l.compte.total}
                  {l.compte.retard ? <span className="ton-retard"> · {l.compte.retard} en retard</span> : null}
                  {l.compte.bloquees ? <span className="ton-veille"> · {l.compte.bloquees} bloquée{l.compte.bloquees > 1 ? "s" : ""}</span> : null}
                </h2>
                {actif && (responsable || gere) && l.etat !== "atteint" ? (
                  <a href={`/taches/nouvelle?projet=${id}&livrable=${l.id}&retour=${encodeURIComponent(ici)}`} className="lien-discret">
                    Ajouter une tâche →
                  </a>
                ) : null}
              </div>
              <ul className="liste">
                {l.taches.map((t) => {
                  const e = echeanceRelative(t.echeance, jour);
                  return (
                    <li key={t.id}>
                      <a href={`/taches/${t.id}?retour=${encodeURIComponent(ici)}`} className="rangee">
                        <span className="mono mono--petit" aria-hidden="true">
                          {t.initiales}
                        </span>
                        <span className="rangee__texte">
                          <span className={`rangee__titre${t.statut === "faite" ? " rangee__titre--faite" : ""}`}>
                          <PastilleStatut statut={t.statut} retard={t.retard} />
                          {t.titre}
                        </span>
                          <span className="rangee__sous">
                            {t.nom}
                            {t.estimationHeures ? ` · ${t.estimationHeures} h` : ""}
                            {t.apres ? <span className="ton-veille"> · après la date du livrable</span> : null}
                          </span>
                        </span>
                        <span className={`rangee__meta ${t.statut === "bloquee" ? "ton-veille" : t.retard ? "ton-retard" : ""}`}>
                          {t.statut === "faite" ? "Faite" : t.statut === "bloquee" ? "Bloquée" : t.statut === "en_cours" ? `En cours${t.echeance ? ` · ${e.texte}` : ""}` : e.texte || "Sans échéance"}
                        </span>
                      </a>
                    </li>
                  );
                })}
                {l.taches.length === 0 ? (
                  <li className="vide">{responsable ? "À vous de déterminer les tâches qui y mènent." : `Pas encore de tâche : ${l.responsable ? `${l.responsable} les détermine` : "nommez un responsable"}.`}</li>
                ) : null}
              </ul>
            </section>
          </div>

          <div className="volets__partie">
            {actif && (peutPret || (gere && (l.etat === "pret" || l.etat === "atteint"))) ? (
              <section className="carte" aria-labelledby="lv-actions" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h2 id="lv-actions" className="carte__titre" style={{ margin: 0 }}>
                  {l.etat === "atteint" ? "Validé" : l.etat === "pret" ? "À valider" : "Quand il est prêt"}
                </h2>
                <div className="livrable__actions" style={{ margin: 0 }}>
                  {peutPret ? (
                    <form action={agirLivrable.bind(null, id, l.id, "pret")}>
                      <input type="hidden" name="depuis" value="livrable" />
                      <button type="submit" className="bouton-mini">
                        <Icone nom="drapeau" taille={14} /> Déclarer prêt à valider
                      </button>
                    </form>
                  ) : null}
                  {gere && l.etat === "pret" ? (
                    <form action={agirLivrable.bind(null, id, l.id, "valider")}>
                      <input type="hidden" name="depuis" value="livrable" />
                      <button type="submit" className="bouton-mini bouton-mini--fort">
                        <Icone nom="coche" taille={14} /> Valider
                      </button>
                    </form>
                  ) : null}
                  {gere && l.etat === "atteint" ? (
                    <form action={agirLivrable.bind(null, id, l.id, "rouvrir")}>
                      <input type="hidden" name="depuis" value="livrable" />
                      <button type="submit" className="bouton-mini">
                        Rouvrir
                      </button>
                    </form>
                  ) : null}
                </div>
                {gere && l.etat === "pret" ? (
                  <form action={agirLivrable.bind(null, id, l.id, "renvoyer")} className="livrable__renvoi-form">
                    <input type="hidden" name="depuis" value="livrable" />
                    <label htmlFor="lv-renvoi">Ou le renvoyer : ce qui reste à reprendre</label>
                    <input id="lv-renvoi" name="remarque" required maxLength={500} placeholder="Ex. : manque la signature de la DRH" />
                    <button type="submit" className="bouton-contour">
                      Renvoyer à reprendre
                    </button>
                  </form>
                ) : null}
                <p className="note" style={{ margin: 0 }}>
                  Le responsable le déclare prêt ; le chef de projet (ou sa direction) le valide ou le renvoie à reprendre.
                </p>
              </section>
            ) : null}

            <section className="carte carte--liste" aria-labelledby="lv-histoire">
              <h2 id="lv-histoire" className="carte__titre">
                Son histoire
              </h2>
              <ul className="liste">
                {histoire.map((e, i) => (
                  <li key={i}>
                    <div className="rangee" style={{ minHeight: 52 }}>
                      <span className="mono mono--petit" aria-hidden="true">
                        <Icone nom={e.genre === "tache" ? "coche" : "drapeau"} taille={14} />
                      </span>
                      <span className="rangee__texte">
                        <span className="rangee__titre">{e.texte}</span>
                        <span className="rangee__sous">
                          {dateCourte(dateLocale(e.le))} à {heure(e.le)}
                          {e.qui ? (
                            <>
                              {" · "}
                              <LienPersonne id={e.quiId}>{e.qui}</LienPersonne>
                            </>
                          ) : null}
                          {e.note ? ` · « ${e.note} »` : ""}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
                {histoire.length === 0 ? <li className="vide">Rien encore : ni tâche faite, ni validation.</li> : null}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
