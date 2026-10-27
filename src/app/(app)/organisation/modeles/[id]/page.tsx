import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateCourte, dateLocale } from "@/lib/dates";
import { modeleDetaille } from "@/lib/donnees/modeles";
import { peutAdministrer } from "@/lib/regles";
import {
  aUneVisibilite,
  CATALOGUE,
  GROUPES_CATALOGUE,
  LIBELLE_REPRISE,
  LIBELLE_RUBRIQUE,
  LIBELLE_VISIBILITE,
  peutEtreObligatoire,
  REPRISES,
  resumeChamp,
  rubriquesPossibles,
  TYPES_CHAMP,
  VISIBILITES,
  type Champ,
} from "@/lib/modeles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { abandonner, affecterAEquipe, affecterAPersonne, enregistrerChamp, modifierReglages, publier, retirer } from "../actions";
import { EditeurChamps, type ChampListe, type GroupePalette } from "./EditeurChamps";

export const metadata: Metadata = { title: "Modèle de rapport" };

const PREREMPLI: Record<string, { titre: string; detail: string }> = {
  lignes: { titre: "Préparer à partir des tâches", detail: "Selon la rubrique : tâches faites, en cours, bloquées, ou prévues dans les deux semaines." },
  sante: { titre: "Proposer un feu", detail: "Celui de la semaine dernière, sinon celui de la fiche du projet." },
  charge: { titre: "Proposer un niveau", detail: "D'après les heures de tâches prévues la semaine prochaine." },
};

/** Éditeur d'un modèle : palette, formulaire (glisser-déposer ou boutons), propriétés, affectations, versions. */
export default async function PageModele({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ champ?: string; erreur?: string }> }) {
  const { id } = await params;
  const { champ: selId, erreur } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  if (!peutAdministrer(u)) notFound();
  const d = await modeleDetaille(id);
  if (!d) notFound();
  const { modele: m, brouillon, courante, champs } = d;
  const chef = m.genre === "chef";
  const nouveaux = new Set(brouillon && courante ? brouillon.champs.filter((c) => !courante.champs.some((x) => x.id === c.id)).map((c) => c.id) : []);
  const liste: ChampListe[] = champs.map((c) => ({
    id: c.id,
    type: c.type,
    libelle: c.libelle,
    resume: resumeChamp(c),
    prive: aUneVisibilite(c.type) && (c.visibilite ?? "tous") !== "tous" ? LIBELLE_VISIBILITE[c.visibilite ?? "tous"].court : "",
    nouveau: nouveaux.has(c.id),
  }));
  const palette: GroupePalette[] = GROUPES_CATALOGUE.filter((g) => g.id !== "chef" || chef).map((g) => ({
    titre: g.titre,
    items: TYPES_CHAMP.filter((t) => CATALOGUE[t].groupe === g.id).map((t) => ({ type: t, nom: CATALOGUE[t].nom, detail: CATALOGUE[t].detail })),
  }));
  const sel: Champ | undefined = champs.find((c) => c.id === selId) ?? champs.find((c) => c.type !== "intertitre") ?? champs[0];
  const etat = brouillon
    ? `Version ${brouillon.numero} en préparation${courante ? ` ; la version ${courante.numero} reste en service jusqu'à la publication` : " ; jamais publiée"}.`
    : courante
      ? `Version ${courante.numero} en service${courante.publieeLe ? ` depuis le ${dateCourte(dateLocale(courante.publieeLe))}` : ""}. Toute modification prépare la version ${courante.numero + 1}.`
      : "Aucune version.";
  const rubriques = sel ? rubriquesPossibles(sel.type) : [];

  return (
    <>
      <Bandeau
        surtitre="Organisation · Modèles de rapport"
        titre={m.nom}
        retour={
          <a href="/organisation/modeles" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Modèles de rapport
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px" }}>
          {chef ? "Modèle de chef : son propre travail, puis ce qu'il reçoit. " : ""}
          {etat}
        </p>
      </Bandeau>
      <div className="page">
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        <section className="carte editeur" aria-label="Formulaire du modèle">
          <div className="editeur__barre">
            <div className="rangee__texte" style={{ flex: "1 1 280px" }}>
              <span className="rangee__titre" style={{ fontWeight: 500 }}>
                {brouillon ? `Version ${brouillon.numero} · brouillon` : courante ? `Version ${courante.numero} · en service` : "Sans version"}
              </span>
              <span className="rangee__sous">Un rapport déjà commencé garde sa version ; la nouvelle s&apos;applique aux rapports créés après la publication.</span>
            </div>
            <a href={`/organisation/modeles/${m.id}/apercu`} className="bouton-contour">
              <Icone nom="document" taille={16} /> Aperçu
            </a>
            {brouillon && courante ? (
              <form action={abandonner.bind(null, m.id)}>
                <button type="submit" className="bouton-contour">
                  Abandonner le brouillon
                </button>
              </form>
            ) : null}
            {brouillon ? (
              <form action={publier.bind(null, m.id)} className="editeur__publier">
                <label className="visuellement-cache" htmlFor="ed-note">
                  Ce qui change dans cette version
                </label>
                <input id="ed-note" name="note" maxLength={300} placeholder="Ce qui change (facultatif)" />
                <button type="submit" className="bouton-ambre">
                  Publier la version {brouillon.numero}
                </button>
              </form>
            ) : null}
          </div>
          <div className="editeur__colonnes">
            <EditeurChamps modeleId={m.id} champs={liste} selection={sel?.id ?? null} palette={palette} />
            <aside className="editeur__proprietes" id="proprietes" aria-labelledby="ed-prop">
              {sel ? (
                <form key={`${sel.id}-${brouillon?.numero ?? 0}-${JSON.stringify(sel).length}`} action={enregistrerChamp.bind(null, m.id, sel.id)} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div>
                    <h2 id="ed-prop" className="editeur__titre">
                      Champ {champs.indexOf(sel) + 1} · propriétés
                    </h2>
                    <span className="note">{CATALOGUE[sel.type].nom}</span>
                  </div>
                  <div className="champ">
                    <label htmlFor="ed-libelle">Libellé</label>
                    <input id="ed-libelle" name="libelle" defaultValue={sel.libelle} required maxLength={120} />
                  </div>
                  <div className="champ">
                    <label htmlFor="ed-aide">{sel.type === "note" ? "Texte de la note" : "Aide affichée sous le libellé"}</label>
                    <textarea id="ed-aide" name="aide" rows={3} defaultValue={sel.aide ?? ""} maxLength={400} />
                  </div>
                  {peutEtreObligatoire(sel.type) ? (
                    <label className="role-manuel">
                      <span className="rangee__texte">
                        <span className="rangee__titre">Obligatoire</span>
                        <span className="rangee__sous">L&apos;envoi attend une réponse{sel.type === "lignes" ? " (au moins une ligne)" : sel.type === "sante" ? " (un feu par projet)" : ""}.</span>
                      </span>
                      <input type="checkbox" className="interrupteur" name="obligatoire" defaultChecked={!!sel.obligatoire} />
                    </label>
                  ) : null}
                  {rubriques.length ? (
                    <fieldset className="editeur__choix">
                      <legend>De quoi parle ce champ</legend>
                      {rubriques.map((r) => (
                        <label key={r} className="choix-radio">
                          <input type="radio" name="rubrique" value={r} defaultChecked={(sel.rubrique ?? "autre") === r} />
                          <span>{LIBELLE_RUBRIQUE[r]}</span>
                        </label>
                      ))}
                      <span className="note">Sert au préremplissage, à « Prévu la semaine dernière » et au rapport du chef.</span>
                    </fieldset>
                  ) : null}
                  {PREREMPLI[sel.type] ? (
                    <label className="role-manuel">
                      <span className="rangee__texte">
                        <span className="rangee__titre">{PREREMPLI[sel.type].titre}</span>
                        <span className="rangee__sous">{PREREMPLI[sel.type].detail}</span>
                      </span>
                      <input type="checkbox" className="interrupteur" name="prerempli" defaultChecked={!!sel.prerempli} />
                    </label>
                  ) : null}
                  {sel.type === "lignes" ? (
                    <label className="role-manuel">
                      <span className="rangee__texte">
                        <span className="rangee__titre">Marquer chaque ligne avec son projet</span>
                        <span className="rangee__sous">Le chef de projet voit alors ses lignes ; la fiche du projet aussi.</span>
                      </span>
                      <input type="checkbox" className="interrupteur" name="parProjet" defaultChecked={sel.parProjet !== false} />
                    </label>
                  ) : null}
                  {sel.type === "choix" || sel.type === "echelle" ? (
                    <div className="champ">
                      <label htmlFor="ed-options">Réponses possibles, une par ligne</label>
                      <textarea id="ed-options" name="options" rows={5} defaultValue={(sel.options ?? []).join("\n")} />
                      <span className="aide">De deux à dix réponses.</span>
                    </div>
                  ) : null}
                  {sel.type === "reprise" ? (
                    <fieldset className="editeur__choix">
                      <legend>Ce qui est repris des rapports reçus</legend>
                      {REPRISES.map((r) => (
                        <label key={r} className="choix-radio">
                          <input type="radio" name="reprise" value={r} defaultChecked={sel.reprise === r} />
                          <span>{LIBELLE_REPRISE[r]}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                  {aUneVisibilite(sel.type) ? (
                    <fieldset className="editeur__choix">
                      <legend>Qui voit ce champ</legend>
                      {VISIBILITES.map((v) => (
                        <label key={v} className="choix-radio">
                          <input type="radio" name="visibilite" value={v} defaultChecked={(sel.visibilite ?? "tous") === v} />
                          <span className="rangee__texte">
                            <span>{LIBELLE_VISIBILITE[v].titre}</span>
                            <span className="rangee__sous">{LIBELLE_VISIBILITE[v].detail}</span>
                          </span>
                        </label>
                      ))}
                      {sel.type === "reprise" ? <span className="note">Dans un rapport de chef, la charge ne remonte qu&apos;en nombres, quel que soit ce réglage.</span> : null}
                    </fieldset>
                  ) : null}
                  {sel.type === "mon_travail" ? <p className="note">Ici, la personne remplit le formulaire de son équipe (ou le modèle par défaut), préparé à partir de ses propres tâches.</p> : null}
                  <div>
                    <button type="submit" className="bouton-contour">
                      <Icone nom="coche" taille={16} /> Enregistrer le champ
                    </button>
                  </div>
                </form>
              ) : (
                <p className="note">Choisissez un champ du formulaire pour régler ses propriétés.</p>
              )}
            </aside>
          </div>
        </section>

        <div className="colonnes" style={{ alignItems: "flex-start" }}>
          <section className="carte" id="qui" aria-labelledby="m-qui" style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 id="m-qui" className="carte__titre" style={{ margin: 0 }}>
              Qui le remplit
            </h2>
            {m.parDefaut ? <p className="note">Modèle par défaut : toute personne sans autre modèle.</p> : null}
            {m.pourChefs ? <p className="note">Modèle des chefs d&apos;équipe : toute personne qui reçoit des rapports, sauf affectation nominative.</p> : null}
            {!chef ? (
              <ul className="liste">
                {d.equipes.map((e) => (
                  <li key={e.id} className="rangee" style={{ minHeight: 52, flexWrap: "wrap" }}>
                    <span className="rangee__texte" style={{ flex: "1 1 180px" }}>
                      <span className="rangee__titre">Équipe {e.nom}</span>
                      <span className="rangee__sous">{e.ici ? "Remplit ce modèle" : e.ailleurs ? `Remplit « ${e.ailleurs} »` : "Modèle par défaut"}</span>
                    </span>
                    {e.ici && e.affectationId ? (
                      <form action={retirer.bind(null, m.id, e.affectationId)}>
                        <button type="submit" className="bouton-mini">
                          Retirer
                        </button>
                      </form>
                    ) : (
                      <form action={affecterAEquipe.bind(null, m.id, e.id)}>
                        <button type="submit" className="bouton-mini">
                          <Icone nom="ajouter" taille={14} /> Affecter
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <h3 style={{ margin: "4px 0 6px", fontSize: 13, fontWeight: 500 }}>Personnes affectées nommément</h3>
              <ul className="liste">
                {d.personnes.map((p) => (
                  <li key={p.affectationId} className="rangee" style={{ minHeight: 48 }}>
                    <span className="rangee__texte">
                      <span className="rangee__titre">{p.nom}</span>
                    </span>
                    <form action={retirer.bind(null, m.id, p.affectationId)}>
                      <button type="submit" className="bouton-mini">
                        Retirer
                      </button>
                    </form>
                  </li>
                ))}
                {d.personnes.length === 0 ? <li className="vide">Personne.</li> : null}
              </ul>
              <form action={affecterAPersonne.bind(null, m.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <label className="visuellement-cache" htmlFor="m-personne">
                  Personne à affecter
                </label>
                <select id="m-personne" name="personneId" defaultValue="" style={{ flex: "1 1 200px", minWidth: 0, maxWidth: "100%", minHeight: 40, border: "1px solid var(--controle)", background: "var(--champ)" }}>
                  <option value="" disabled>
                    Choisir une personne
                  </option>
                  {d.personnesOptions
                    .filter((p) => !d.personnes.some((x) => x.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                        {p.ailleurs ? ` (aujourd'hui : ${p.ailleurs})` : ""}
                      </option>
                    ))}
                </select>
                <button type="submit" className="bouton-contour">
                  <Icone nom="ajouter" taille={16} /> Affecter
                </button>
              </form>
            </div>
          </section>

          <section className="carte" id="reglages" aria-labelledby="m-reglages" style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h2 id="m-reglages" className="carte__titre">
              Réglages
            </h2>
            <form action={modifierReglages.bind(null, m.id)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="champ">
                <label htmlFor="m-nom">Nom</label>
                <input id="m-nom" name="nom" defaultValue={m.nom} required maxLength={80} />
              </div>
              <div className="champ">
                <label htmlFor="m-description">Description</label>
                <textarea id="m-description" name="description" rows={2} defaultValue={m.description} maxLength={300} />
              </div>
              <label className="role-manuel">
                <span className="rangee__texte">
                  <span className="rangee__titre">Actif</span>
                  <span className="rangee__sous">Désactivé, il n&apos;est plus proposé ; les rapports déjà faits restent lisibles.</span>
                </span>
                <input type="checkbox" className="interrupteur" name="actif" defaultChecked={m.actif} disabled={m.parDefaut} />
              </label>
              {m.parDefaut ? <input type="hidden" name="actif" value="on" /> : null}
              {!chef ? (
                <label className="role-manuel">
                  <span className="rangee__texte">
                    <span className="rangee__titre">Modèle par défaut</span>
                    <span className="rangee__sous">Un seul : le désigner ici le retire de l&apos;ancien.</span>
                  </span>
                  <input type="checkbox" className="interrupteur" name="parDefaut" defaultChecked={m.parDefaut} disabled={m.parDefaut} />
                </label>
              ) : (
                <label className="role-manuel">
                  <span className="rangee__texte">
                    <span className="rangee__titre">Modèle des chefs d&apos;équipe</span>
                    <span className="rangee__sous">Pour toute personne qui reçoit des rapports. Un seul.</span>
                  </span>
                  <input type="checkbox" className="interrupteur" name="pourChefs" defaultChecked={m.pourChefs} />
                </label>
              )}
              <p className="note">Fréquence : chaque semaine, à envoyer le vendredi. Un rapport de chef est prêt dès que les rapports de son équipe arrivent.</p>
              <div>
                <button type="submit" className="bouton-contour">
                  Enregistrer les réglages
                </button>
              </div>
            </form>
          </section>

          <section className="carte carte--liste" aria-labelledby="m-versions" style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h2 id="m-versions" className="carte__titre">
              Versions
            </h2>
            <ol className="liste">
              {d.versions.map((v) => (
                <li key={v.id} style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 500 }}>Version {v.numero}</span>
                    <span className={`marque-modele ${v.statut === "brouillon" ? "marque-modele--ambre" : v.statut === "publiee" ? "marque-modele--relief" : ""}`}>
                      {v.statut === "brouillon" ? "Brouillon" : v.statut === "publiee" ? "En service" : "Archivée"}
                    </span>
                  </span>
                  {v.note ? <span style={{ fontSize: 14 }}>{v.note}</span> : null}
                  <span className="rangee__sous">
                    {v.publieeLe ? `Publiée le ${dateCourte(dateLocale(v.publieeLe))}${v.publieePar ? ` par ${v.publieePar}` : ""}` : `Commencée le ${dateCourte(dateLocale(v.creeLe))}${v.creeePar ? ` par ${v.creeePar}` : ""}`}
                    {v.rapports ? ` · ${v.rapports} rapport${v.rapports > 1 ? "s" : ""} envoyé${v.rapports > 1 ? "s" : ""}` : ""}
                  </span>
                </li>
              ))}
            </ol>
            <p className="note" style={{ margin: "10px 0 4px" }}>
              Un rapport envoyé garde sa version : on le relit tel qu&apos;il a été rempli.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
