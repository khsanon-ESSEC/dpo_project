import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { activiteDuProjet, membresDuProjet } from "@/lib/donnees/gestion";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { dateCourte } from "@/lib/dates";
import { LIBELLE_ETAT_LIVRABLE, LIBELLE_STATUT_PROJET, peutGererProjet, projetSupprimable, STATUTS_ACCEPTES } from "@/lib/projets";
import { ListeFiltrable } from "@/components/ListeFiltrable";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChoixPersonne } from "@/components/ChoixPersonne";
import { archiver, deplacerInd, enregistrerLivrable, enregistrerProjet, nouveauLivrable, retirerInd, supprimer } from "../../gestion-actions";

export const metadata: Metadata = { title: "Modifier le projet" };


export default async function PageModifierProjet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string; enregistre?: string; livrable?: string }> }) {
  const { id } = await params;
  const { erreur, enregistre, livrable } = await searchParams;
  const livrableOk = livrable === "ajoute" || livrable === "enregistre" ? livrable : null;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, id);
  if (!peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) notFound();
  const [indicateurs, activite, org, membres, tachesLiees] = await Promise.all([
    db.select().from(schema.indicateurs).where(eq(schema.indicateurs.projetId, id)).orderBy(asc(schema.indicateurs.ordre)),
    activiteDuProjet(id),
    chargerOrganisation(),
    membresDuProjet(id),
    db.select({ livrableId: schema.taches.livrableId }).from(schema.taches).where(and(eq(schema.taches.projetId, id), isNull(schema.taches.annuleeLe))),
  ]);
  const nTaches = new Map<string, number>();
  for (const t of tachesLiees) if (t.livrableId) nTaches.set(t.livrableId, (nTaches.get(t.livrableId) ?? 0) + 1);
  const personnes = [...org.personnes.values()]
    .filter((x) => x.actif || x.id === p.chefProjetId || x.id === p.referentId)
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    .map((x) => ({ id: x.id, nom: nomComplet(x), externe: x.externe, organisation: x.organisation, poste: x.poste }));
  // Responsable d'un livrable : l'équipe du projet d'abord, puis les autres personnes actives.
  const equipe = new Set([p.chefProjetId, p.referentId, ...membres.map((m) => m.personneId)].filter((x): x is string => !!x));
  const optionsResponsable = [
    ...personnes.filter((x) => equipe.has(x.id)).map((x) => ({ value: x.id, label: x.nom, detail: x.poste || x.organisation || undefined, groupe: "Équipe du projet" })),
    ...personnes.filter((x) => !equipe.has(x.id) && !x.externe).map((x) => ({ value: x.id, label: x.nom, detail: x.poste || undefined, groupe: "Division" })),
    ...personnes.filter((x) => !equipe.has(x.id) && x.externe).map((x) => ({ value: x.id, label: x.nom, detail: x.organisation || undefined, groupe: "Hors division" })),
  ];
  const supprimable = projetSupprimable(activite);
  const demande = p.statut === "requete" || p.statut === "refuse";

  return (
    <>
      <Bandeau
        surtitre="Modifier le projet"
        titre={p.titre}
        retour={
          <a href={`/projets/${p.id}`} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {p.titre}
          </a>
        }
      />
      <div className="page" style={{ maxWidth: 860 }}>
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : enregistre ? (
          <p className="succes" role="status">
            Projet enregistré.
          </p>
        ) : null}
        <form action={enregistrerProjet.bind(null, p.id)} className="carte" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h2 className="carte__titre" style={{ margin: 0 }}>
            Fiche du projet
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div className="champ" style={{ flex: "0 1 110px" }}>
              <label htmlFor="mp-code">Code</label>
              <input id="mp-code" name="code" defaultValue={p.code} required maxLength={4} style={{ textTransform: "uppercase" }} />
            </div>
            <div className="champ" style={{ flex: "1 1 320px" }}>
              <label htmlFor="mp-titre">Titre</label>
              <input id="mp-titre" name="titre" defaultValue={p.titre} required maxLength={160} />
            </div>
          </div>
          <div className="champ">
            <label htmlFor="mp-description">Description</label>
            <textarea id="mp-description" name="description" rows={3} defaultValue={p.description} maxLength={2000} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div className="champ" style={{ flex: "2 1 240px" }}>
              <label htmlFor="mp-programme">Programme</label>
              <input id="mp-programme" name="programme" defaultValue={p.programme} maxLength={160} />
            </div>
            <div className="champ" style={{ flex: "1 1 220px" }}>
              <label htmlFor="mp-division">Division du projet</label>
              <input id="mp-division" name="division" defaultValue={p.division} maxLength={120} placeholder="Vide : la DPO" aria-describedby="mp-division-aide" />
              <span className="aide" id="mp-division-aide">
                Pour un projet d&apos;une autre division. Il n&apos;entre pas dans le rapport mensuel au conseil.
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <ChoixPersonne id="mp-chef" name="chefProjetId" prefixe="chef" libelle="Chef de projet" personnes={personnes} defaut={p.chefProjetId} vide={demande ? "À nommer" : "Choisir"} />
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <ChoixPersonne
                id="mp-referent"
                name="referentId"
                prefixe="referent"
                libelle="Référent DPO"
                personnes={personnes.filter((x) => !x.externe)}
                defaut={p.referentId}
                vide="Aucun"
                horsDivision={false}
                aide="Obligatoire quand le chef de projet est hors division : il a ici les droits de chef de projet."
              />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div className="champ" style={{ flex: "1 1 180px" }}>
              <label htmlFor="mp-statut">Statut</label>
              {demande ? (
                <>
                  <input type="hidden" name="statut" value={p.statut} />
                  <input id="mp-statut" value={LIBELLE_STATUT_PROJET[p.statut]} disabled />
                </>
              ) : (
                <select id="mp-statut" name="statut" defaultValue={p.statut}>
                  {STATUTS_ACCEPTES.map((x) => (
                    <option key={x} value={x}>
                      {LIBELLE_STATUT_PROJET[x]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {(
              [
                ["dateEntree", "Date d'entrée", p.dateEntree],
                ["dateFinInitiale", "Fin prévue initialement", p.dateFinInitiale],
                ["dateFinPrevue", "Fin prévue aujourd'hui", p.dateFinPrevue],
                ["dateLancementPrevue", "Lancement prévu", p.dateLancementPrevue],
              ] as const
            ).map(([nom, libelle, valeur]) => (
              <div key={nom} className="champ" style={{ flex: "1 1 170px" }}>
                <label htmlFor={`mp-${nom}`}>{libelle}</label>
                <input id={`mp-${nom}`} name={nom} type="date" defaultValue={valeur ?? ""} />
              </div>
            ))}
          </div>
          <div className="champ">
            <label htmlFor="mp-motifReport">Si vous repoussez la fin prévue : pourquoi</label>
            <input id="mp-motifReport" name="motifReport" maxLength={300} placeholder="Ex. : la DTI livre le serveur de test le 13 novembre" />
          </div>
          <label className="role-manuel">
            <span className="rangee__texte">
              <span className="rangee__titre">Projet stratégique</span>
              <span className="rangee__sous">Il figure au rapport mensuel au conseil.</span>
            </span>
            <input type="checkbox" className="interrupteur" name="strategique" defaultChecked={p.strategique} />
          </label>
          <div>
            <button type="submit" className="bouton-ambre">
              Enregistrer
            </button>
          </div>
        </form>

        <section className="carte carte--liste" id="livrables" aria-labelledby="mp-livrables" style={{ scrollMarginTop: 80 }}>
          <h2 id="mp-livrables" className="carte__titre">
            Livrables · {indicateurs.length}
          </h2>
          <p className="note" style={{ margin: "4px 0 12px" }}>
            Un livrable, une date, un responsable. Le responsable détermine les tâches qui y mènent et peut en confier à l&apos;équipe du projet ; il le déclare prêt à valider, et vous le validez sur la page du projet.
          </p>
          {livrableOk ? (
            <p className="succes" role="status" style={{ margin: "0 0 12px" }}>
              {livrableOk === "ajoute" ? "Livrable ajouté : son responsable est prévenu." : "Livrable enregistré."}
            </p>
          ) : null}
          <ol className="livrables-gestion">
            {indicateurs.map((i, n) => (
              <li key={i.id} id={`livrable-${i.id}`} className="livrables-gestion__ligne" style={{ scrollMarginTop: 80 }}>
                <details className="livrables-gestion__details">
                  <summary className="livrables-gestion__resume">
                    <span className="livrables-gestion__ordre" aria-hidden="true">
                      {i.ordre}
                    </span>
                    <span className="livrables-gestion__texte">
                      <span className="livrables-gestion__libelle">{i.libelle}</span>
                      <span className="rangee__sous">
                        {[
                          i.prevuLe ? `prévu le ${dateCourte(i.prevuLe)}` : "sans date",
                          i.responsableId ? (personnes.find((x) => x.id === i.responsableId)?.nom ?? "—") : "sans responsable",
                          LIBELLE_ETAT_LIVRABLE[i.etat].toLowerCase(),
                          nTaches.get(i.id) ? `${nTaches.get(i.id)} tâche${nTaches.get(i.id)! > 1 ? "s" : ""}` : "aucune tâche",
                        ].join(" · ")}
                      </span>
                    </span>
                    <span className="livrables-gestion__modifier" aria-hidden="true">
                      <Icone nom="modifier" taille={14} /> Modifier
                    </span>
                  </summary>
                  <form action={enregistrerLivrable.bind(null, p.id, i.id)} className="livrables-gestion__form">
                    <div className="champ livrables-gestion__nom">
                      <label htmlFor={`lv-l-${i.id}`}>Livrable</label>
                      <input id={`lv-l-${i.id}`} name="libelle" defaultValue={i.libelle} required maxLength={200} />
                    </div>
                    <div className="champ livrables-gestion__date">
                      <label htmlFor={`lv-d-${i.id}`}>Prévu le</label>
                      <input id={`lv-d-${i.id}`} name="prevuLe" type="date" defaultValue={i.prevuLe ?? ""} />
                    </div>
                    <div className="champ livrables-gestion__resp">
                      <label htmlFor={`lv-r-${i.id}`}>Responsable</label>
                      <ListeFiltrable id={`lv-r-${i.id}`} name="responsableId" defaultValue={i.responsableId ?? ""} vide="Aucun" placeholder="Tapez un nom" options={optionsResponsable} aucun="Personne ne correspond à" />
                    </div>
                    <div className="champ livrables-gestion__critere">
                      <label htmlFor={`lv-c-${i.id}`}>Validé quand (facultatif)</label>
                      <input id={`lv-c-${i.id}`} name="critere" defaultValue={i.critere} maxLength={500} placeholder="Ex. : rapport d'audit sans point critique" />
                    </div>
                    <div className="livrables-gestion__pied">
                      <button type="submit" className="bouton-contour">
                        <Icone nom="coche" taille={16} /> Enregistrer
                      </button>
                    </div>
                  </form>
                </details>
                <span className="livrables-gestion__outils">
                  <form action={deplacerInd.bind(null, p.id, i.id, -1)}>
                    <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={n === 0} aria-label={`Monter « ${i.libelle} »`} title="Monter">
                      <Icone nom="chevron-haut" taille={16} />
                    </button>
                  </form>
                  <form action={deplacerInd.bind(null, p.id, i.id, 1)}>
                    <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={n === indicateurs.length - 1} aria-label={`Descendre « ${i.libelle} »`} title="Descendre">
                      <Icone nom="chevron-bas" taille={16} />
                    </button>
                  </form>
                  <form action={retirerInd.bind(null, p.id, i.id)}>
                    <button
                      type="submit"
                      className="bouton-icone"
                      style={{ width: 32, height: 32 }}
                      aria-label={`Retirer « ${i.libelle} »${nTaches.get(i.id) ? ` (ses tâches restent, hors livrable)` : ""}`}
                      title={nTaches.get(i.id) ? "Retirer (ses tâches restent, hors livrable)" : "Retirer"}
                    >
                      <Icone nom="fermer" taille={16} />
                    </button>
                  </form>
                </span>
              </li>
            ))}
            {indicateurs.length === 0 ? <li className="vide">Aucun livrable.</li> : null}
          </ol>
          <form action={nouveauLivrable.bind(null, p.id)} className="livrables-gestion__nouveau">
            <h3 className="sante-barre__titre" style={{ margin: 0 }}>
              Nouveau livrable
            </h3>
            <div className="livrables-gestion__form livrables-gestion__form--nouveau">
              <div className="champ livrables-gestion__nom">
                <label htmlFor="mp-nouvel-ind">Livrable</label>
                <input id="mp-nouvel-ind" name="libelle" required maxLength={200} placeholder="Ex. : Modèle conceptuel validé" />
              </div>
              <div className="champ livrables-gestion__date">
                <label htmlFor="mp-nouvel-date">Prévu le</label>
                <input id="mp-nouvel-date" name="prevuLe" type="date" />
              </div>
              <div className="champ livrables-gestion__resp">
                <label htmlFor="mp-nouvel-resp">Responsable</label>
                <ListeFiltrable id="mp-nouvel-resp" name="responsableId" vide="Aucun" placeholder="Tapez un nom" options={optionsResponsable} aucun="Personne ne correspond à" />
              </div>
              <div className="champ livrables-gestion__critere">
                <label htmlFor="mp-nouvel-critere">Validé quand (facultatif)</label>
                <input id="mp-nouvel-critere" name="critere" maxLength={500} placeholder="Ex. : maquettes signées par le métier" />
              </div>
              <div className="livrables-gestion__pied">
                <button type="submit" className="bouton-contour">
                  <Icone nom="ajouter" taille={16} /> Ajouter le livrable
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="carte" id="zone" aria-labelledby="mp-zone" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="mp-zone" className="carte__titre" style={{ margin: 0 }}>
            Archiver ou supprimer
          </h2>
          {supprimable ? (
            <>
              <p className="note" style={{ margin: 0 }}>
                Ce projet n&apos;a encore ni tâche, ni rapport, ni réunion : il peut être supprimé définitivement.
              </p>
              <form action={supprimer.bind(null, p.id)} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                <label className="confirmer">
                  <input type="checkbox" name="confirme" required /> Oui, supprimer définitivement
                </label>
                <button type="submit" className="bouton-contour" style={{ color: "var(--retard)", borderColor: "var(--retard-point)" }}>
                  Supprimer « {p.titre} »
                </button>
              </form>
            </>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              Ce projet a une histoire ({[activite.taches ? `${activite.taches} tâche${activite.taches > 1 ? "s" : ""}` : null, activite.lignesRapport ? "des lignes de rapport" : null, activite.lignesConseil || activite.historique ? "des rapports au conseil" : null, activite.reunions ? "des réunions" : null, activite.documents ? "des documents" : null].filter(Boolean).join(", ")}) : il ne se supprime pas. Archivé, il quitte le portefeuille et reste lisible.
            </p>
          )}
          {p.archiveLe ? (
            <form action={archiver.bind(null, p.id, false)}>
              <button type="submit" className="bouton-contour">
                Désarchiver
              </button>
            </form>
          ) : (
            <form action={archiver.bind(null, p.id, true)}>
              <button type="submit" className="bouton-contour">
                Archiver le projet
              </button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
