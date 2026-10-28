import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { activiteDuProjet } from "@/lib/donnees/gestion";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { LIBELLE_STATUT_PROJET, peutGererProjet, projetSupprimable, STATUTS_ACCEPTES } from "@/lib/projets";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChoixPersonne } from "@/components/ChoixPersonne";
import { archiver, deplacerInd, enregistrerProjet, nouvelIndicateur, renommer, retirerInd, supprimer } from "../../gestion-actions";

export const metadata: Metadata = { title: "Modifier le projet" };

const ETAT_IND = { atteint: "Atteint", en_cours: "En cours", a_venir: "À venir" } as const;

export default async function PageModifierProjet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string; enregistre?: string }> }) {
  const { id } = await params;
  const { erreur, enregistre } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, id);
  if (!peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir }, p)) notFound();
  const [indicateurs, activite, org] = await Promise.all([
    db.select().from(schema.indicateurs).where(eq(schema.indicateurs.projetId, id)).orderBy(asc(schema.indicateurs.ordre)),
    activiteDuProjet(id),
    chargerOrganisation(),
  ]);
  const personnes = [...org.personnes.values()]
    .filter((x) => x.actif || x.id === p.chefProjetId || x.id === p.referentId)
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    .map((x) => ({ id: x.id, nom: nomComplet(x), externe: x.externe, organisation: x.organisation }));
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
            <div className="champ" style={{ flex: "1 1 180px" }}>
              <label htmlFor="mp-sante">Santé</label>
              <select id="mp-sante" name="sante" defaultValue={p.sante}>
                <option value="dans_les_temps">Dans les temps</option>
                <option value="a_surveiller">À surveiller</option>
                <option value="en_retard">En retard</option>
              </select>
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

        <section className="carte carte--liste" aria-labelledby="mp-ind">
          <h2 id="mp-ind" className="carte__titre">
            Indicateurs vérifiables · {indicateurs.length}
          </h2>
          <ol className="liste">
            {indicateurs.map((i, n) => (
              <li key={i.id} className="rangee" style={{ minHeight: 56, flexWrap: "wrap", gap: 8 }}>
                <span style={{ width: 18, flex: "none", fontSize: 12, color: "var(--discret)", textAlign: "right" }}>{i.ordre}</span>
                <form action={renommer.bind(null, p.id, i.id)} style={{ flex: "1 1 240px", display: "flex", gap: 6, minWidth: 0 }}>
                  <label className="visuellement-cache" htmlFor={`ind-l-${i.id}`}>
                    Libellé de l&apos;indicateur {i.ordre}
                  </label>
                  <input id={`ind-l-${i.id}`} name="libelle" defaultValue={i.libelle} maxLength={200} style={{ flex: 1, minWidth: 0, minHeight: 36, padding: "0 10px", border: "1px solid var(--filet-fort)", background: "var(--champ)", color: "inherit" }} />
                  <button type="submit" className="bouton-icone" style={{ width: 36, height: 36 }} aria-label="Enregistrer le libellé" title="Enregistrer">
                    <Icone nom="coche" taille={16} />
                  </button>
                </form>
                <span className="rangee__meta" style={{ fontSize: 12 }}>
                  {ETAT_IND[i.etat]}
                </span>
                <span style={{ display: "flex", gap: 4 }}>
                  <form action={deplacerInd.bind(null, p.id, i.id, -1)}>
                    <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={n === 0} aria-label="Monter" title="Monter">
                      <Icone nom="chevron-haut" taille={16} />
                    </button>
                  </form>
                  <form action={deplacerInd.bind(null, p.id, i.id, 1)}>
                    <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={n === indicateurs.length - 1} aria-label="Descendre" title="Descendre">
                      <Icone nom="chevron-bas" taille={16} />
                    </button>
                  </form>
                  <form action={retirerInd.bind(null, p.id, i.id)}>
                    <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} aria-label={`Retirer « ${i.libelle} »`} title="Retirer">
                      <Icone nom="fermer" taille={16} />
                    </button>
                  </form>
                </span>
              </li>
            ))}
            {indicateurs.length === 0 ? <li className="vide">Aucun indicateur.</li> : null}
          </ol>
          <form action={nouvelIndicateur.bind(null, p.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <label className="visuellement-cache" htmlFor="mp-nouvel-ind">
              Nouvel indicateur
            </label>
            <input id="mp-nouvel-ind" name="libelle" required maxLength={200} placeholder="Ex. : Recette réalisée avec le métier" style={{ flex: "1 1 260px", minWidth: 0, minHeight: 40, padding: "0 12px", border: "1px solid var(--controle)", background: "var(--champ)", color: "inherit" }} />
            <button type="submit" className="bouton-contour">
              <Icone nom="ajouter" taille={16} /> Ajouter
            </button>
          </form>
          <p className="note" style={{ margin: "10px 0 4px" }}>
            L&apos;état de chaque indicateur se change sur la page du projet.
          </p>
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
              Ce projet a une histoire ({[activite.taches ? `${activite.taches} tâche${activite.taches > 1 ? "s" : ""}` : null, activite.lignesRapport ? "des lignes de rapport" : null, activite.lignesConseil || activite.historique ? "des rapports au conseil" : null, activite.reunions ? "des réunions" : null].filter(Boolean).join(", ")}) : il ne se supprime pas. Archivé, il quitte le portefeuille et reste lisible.
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
