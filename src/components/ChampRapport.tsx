/**
 * Un champ du rapport, selon son type : en saisie (le brouillon), en lecture (un rapport envoyé),
 * ou en aperçu (l'éditeur de modèles). Les contrôles interactifs sont dans rapport/Lignes.tsx.
 */
import { ajouterLigne } from "@/app/(app)/rapport/actions";
import { BoutonRemettre, CasePartie, ChoixSegmente, CommentaireFeu, InterrupteurRemonter, LigneEditable, TexteReponse } from "@/app/(app)/rapport/Lignes";
import { Icone } from "@/components/Icone";
import {
  CATALOGUE,
  estDecoratif,
  LIBELLE_RUBRIQUE,
  LIBELLE_VISIBILITE,
  libelleRessenti,
  libelleSante,
  lireComptes,
  NIVEAUX_RESSENTI,
  NIVEAUX_SANTE,
  texteComptes,
  type Champ,
} from "@/lib/modeles";
import type { AvisSante, ChargeMembre, LigneLue, ReponseLue } from "@/lib/donnees/rapport";
import type { ComptesCharge } from "@/lib/modeles";

export type ContexteRapport = {
  mode: "saisie" | "lecture" | "apercu";
  rapportId: string;
  lignes: LigneLue[];
  reponses: ReponseLue[];
  relues: Set<string>;
  projets: { id: string; code: string; titre: string }[];
  /** Initiales et noms des personnes (auteurs des éléments reçus). */
  personnes: Map<string, { initiales: string; nom: string }>;
  /** Prénom du supérieur (« Remonter à … »). */
  superieur: string | null;
  /** Brouillon d'un rapport de chef : feux et charge de l'équipe, en direct. */
  equipe?: {
    sante: Map<string, AvisSante[]>;
    charge: { membres: ChargeMembre[]; equipes: { qui: string; comptes: ComptesCharge }[]; comptes: ComptesCharge };
  } | null;
  /** Les titres des champs sont des h3 quand le formulaire a des intertitres. */
  niveauTitre: 2 | 3;
};

const NIVEAU_CALCULE: Record<string, string> = { libre: "de la marge", normale: "normale", chargee: "chargée", surchargee: "surchargée" };

function Verrou({ c }: { c: Champ }) {
  const v = c.visibilite ?? "tous";
  if (v === "tous" || estDecoratif(c)) return null;
  return (
    <span className="verrou" title={LIBELLE_VISIBILITE[v].detail}>
      <Icone nom="cadenas" taille={14} />
      {LIBELLE_VISIBILITE[v].court}
    </span>
  );
}

function Titre({ c, x, id, nombre, ton, glyphe }: { c: Champ; x: ContexteRapport; id: string; nombre?: number | null; ton?: string; glyphe?: boolean }) {
  const H = x.niveauTitre === 3 ? "h3" : "h2";
  const remplissable = !estDecoratif(c) && !(c.type === "reprise" && (c.reprise === "sante" || c.reprise === "charge"));
  return (
    <div className="champ-rapport__tete">
      {nombre !== undefined && nombre !== null ? <span className={`champ-rapport__nombre ${ton ?? ""}`}>{nombre}</span> : glyphe ? <span className="champ-rapport__nombre" aria-hidden="true" /> : null}
      <div className="champ-rapport__titre">
        <H id={id}>{c.libelle}</H>
        <Verrou c={c} />
        {!c.obligatoire && x.mode !== "lecture" && !estDecoratif(c) && c.type !== "reprise" ? <span className="ton-discret" style={{ fontSize: 12 }}>Facultatif</span> : null}
      </div>
      {x.mode === "saisie" && remplissable ? <CasePartie rapportId={x.rapportId} champId={c.id} relue={x.relues.has(c.id)} libelle={c.libelle} /> : null}
    </div>
  );
}

/** L'aide s'adresse à la personne qui remplit : elle n'est pas montrée à la lecture. */
const Aide = ({ c, id, x }: { c: Champ; id?: string; x: ContexteRapport }) => (c.aide && x.mode !== "lecture" ? <p className="champ-rapport__aide" id={id}>{c.aide}</p> : null);

export function ChampRapport({ c, x }: { c: Champ; x: ContexteRapport }) {
  const idT = `c-${c.id}`;
  const idA = `a-${c.id}`;
  const lignes = x.lignes.filter((l) => l.champId === c.id);
  const reponses = x.reponses.filter((r) => r.champId === c.id);
  const saisie = x.mode === "saisie";

  if (c.type === "intertitre") {
    return (
      <div className="partie" id={`partie-${c.id}`}>
        <h2 id={idT} className="partie__titre">
          {c.libelle}
        </h2>
        {c.aide && x.mode !== "lecture" ? <p className="note">{c.aide}</p> : null}
      </div>
    );
  }
  if (c.type === "note") return x.mode === "lecture" ? null : <p className="carte note" style={{ margin: 0, padding: "14px 20px" }}>{c.aide || c.libelle}</p>;
  if (c.type === "mon_travail") {
    return (
      <div className="partie">
        <h2 id={idT} className="partie__titre">
          {c.libelle}
        </h2>
        <p className="note">{c.aide || "Le formulaire de l'équipe de la personne, préparé à partir de ses propres tâches."}</p>
      </div>
    );
  }

  // ---------- Lignes ----------
  if (c.type === "lignes") {
    const propres = lignes.filter((l) => l.origines.length === 0);
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} nombre={x.mode === "apercu" ? null : propres.length} ton={c.rubrique === "bloque" && propres.length ? "ton-veille" : ""} glyphe={x.mode === "apercu"} />
        <Aide c={c} id={idA} x={x} />
        {x.mode === "apercu" ? (
          <p className="champ-rapport__corps apercu">
            {c.prerempli && c.rubrique && c.rubrique !== "autre" ? `Préparé à partir des tâches : ${LIBELLE_RUBRIQUE[c.rubrique].toLowerCase()}.` : "La personne écrit ses lignes."}
            {c.parProjet !== false ? " Chaque ligne porte son projet." : ""}
          </p>
        ) : (
          <ul className="liste champ-rapport__corps">
            {propres.map((l) => (
              <LigneEditable key={l.id} ligne={l} projets={x.projets} modifiable={saisie} parProjet={c.parProjet !== false} />
            ))}
            {propres.length === 0 ? (
              <li style={{ borderTop: 0 }} className="vide">
                Rien cette semaine.
              </li>
            ) : null}
          </ul>
        )}
        {saisie ? (
          <form action={ajouterLigne.bind(null, x.rapportId, c.id)} className="champ-rapport__corps" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <label className="visuellement-cache" htmlFor={`ajout-${c.id}`}>
              Ajouter une ligne à « {c.libelle} »
            </label>
            <input id={`ajout-${c.id}`} name="texte" maxLength={500} placeholder="Ajouter une ligne" style={{ flex: "1 1 220px", minHeight: 40, padding: "0 12px", border: "1px solid var(--filet-fort)", background: "var(--champ)", fontSize: 14 }} />
            {c.parProjet !== false ? (
              <>
                <label className="visuellement-cache" htmlFor={`ajout-projet-${c.id}`}>
                  Projet de la ligne
                </label>
                <select id={`ajout-projet-${c.id}`} name="projetId" defaultValue="" style={{ minHeight: 40, border: "1px solid var(--filet-fort)", background: "var(--champ)", fontSize: 13, maxWidth: 200 }}>
                  <option value="">Sans projet</option>
                  {x.projets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.titre}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <button type="submit" className="bouton-contour">
              <Icone nom="ajouter" taille={16} /> Ajouter
            </button>
          </form>
        ) : null}
      </section>
    );
  }

  // ---------- Santé des projets ----------
  if (c.type === "sante") {
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} nombre={x.mode === "apercu" ? null : reponses.length} glyphe={x.mode === "apercu"} />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps">
          {x.mode === "apercu" ? (
            <p className="apercu">
              Un feu par projet sur lequel la personne a des tâches : {NIVEAUX_SANTE.map((n) => n.libelle).join(", ")}.{c.prerempli ? " Proposé : le feu de la semaine dernière, sinon celui de la fiche du projet." : ""}
            </p>
          ) : reponses.length === 0 ? (
            <p className="vide" style={{ margin: 0 }}>
              Aucun projet à noter cette semaine.
            </p>
          ) : (
            reponses.map((r) => {
              const change = r.propose && r.valeur && r.valeur !== r.propose;
              return (
                <fieldset key={r.id} className="feu">
                  <legend className="visuellement-cache">{r.projetTitre}</legend>
                  <div className="feu__ligne">
                    <span className="feu__nom">
                      <span className="etiquette-projet">{r.projetCode}</span>
                      <span className="rangee__texte">
                        <span className="rangee__titre">{r.projetTitre}</span>
                        {saisie && r.propose ? <span className={`rangee__sous ${change ? "ton-veille" : ""}`}>{change ? `Changé : « ${libelleSante(r.propose)} » était proposé` : "Proposé"}</span> : null}
                      </span>
                    </span>
                    {saisie ? (
                      <ChoixSegmente
                        rapportId={x.rapportId}
                        champId={c.id}
                        projetId={r.projetId}
                        nom={`feu-${c.id}-${r.projetId}`}
                        libelle={`Santé de ${r.projetTitre}`}
                        valeur={r.valeur}
                        choix={NIVEAUX_SANTE.map((n) => ({ valeur: n.valeur, libelle: n.libelle, ton: n.valeur === "en_retard" ? ("retard" as const) : undefined }))}
                      />
                    ) : (
                      <span className={`pastille-sante pastille-sante--${r.valeur || "vide"}`}>{libelleSante(r.valeur) || "Non noté"}</span>
                    )}
                  </div>
                  {saisie && r.valeur && r.valeur !== "dans_les_temps" ? (
                    <div className="feu__raison">
                      <label htmlFor={`raison-${c.id}-${r.projetId}`}>En une phrase, pourquoi ?</label>
                      <CommentaireFeu rapportId={x.rapportId} champId={c.id} projetId={r.projetId!} valeur={r.commentaire} id={`raison-${c.id}-${r.projetId}`} />
                    </div>
                  ) : !saisie && r.commentaire ? (
                    <p className="feu__raison note" style={{ margin: 0 }}>
                      {r.commentaire}
                    </p>
                  ) : null}
                </fieldset>
              );
            })
          )}
        </div>
      </section>
    );
  }

  // ---------- Charge ressentie ----------
  if (c.type === "charge") {
    const r = reponses[0];
    const ecart = r?.propose && r.valeur && r.valeur !== r.propose;
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} glyphe />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {x.mode === "apercu" ? (
            <p className="apercu">
              {NIVEAUX_RESSENTI.map((n) => n.libelle).join(", ")}.{c.prerempli ? " Proposé d'après les heures de tâches prévues ; la personne corrige si ce n'est pas son ressenti." : ""}
            </p>
          ) : saisie ? (
            <ChoixSegmente
              rapportId={x.rapportId}
              champId={c.id}
              nom={`charge-${c.id}`}
              libelle={c.libelle}
              valeur={r?.valeur ?? ""}
              choix={NIVEAUX_RESSENTI.map((n) => ({ valeur: n.valeur, libelle: n.libelle, propose: r?.propose === n.valeur }))}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 15 }}>{libelleRessenti(r?.valeur) || "Non renseignée"}</p>
          )}
          {x.mode !== "apercu" && r?.commentaire ? (
            <span className="note">
              Calculé : {r.commentaire} de tâches prévues la semaine prochaine{!saisie && r.propose ? ` (proposé : ${libelleRessenti(r.propose).toLowerCase()})` : ""}.
            </span>
          ) : null}
          {saisie && ecart ? <span className="note ton-veille">Votre ressenti diffère du calcul : votre supérieur verra les deux. Une estimation de tâche à revoir ?</span> : null}
        </div>
      </section>
    );
  }

  // ---------- Textes, choix, nombres, dates ----------
  if (c.type === "texte" || c.type === "texte_long" || c.type === "nombre" || c.type === "date" || c.type === "choix" || c.type === "echelle") {
    const v = reponses[0]?.valeur ?? "";
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} glyphe />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps">
          {x.mode === "apercu" ? (
            <p className="apercu">
              {c.type === "choix" || c.type === "echelle" ? `Une réponse parmi : ${(c.options ?? []).join(", ")}.` : `${CATALOGUE[c.type].nom}.`}
              {c.rubrique === "decision" ? " Repris en tête du rapport du chef, avec « À décider »." : ""}
            </p>
          ) : saisie ? (
            c.type === "choix" || c.type === "echelle" ? (
              <ChoixSegmente rapportId={x.rapportId} champId={c.id} nom={`choix-${c.id}`} libelle={c.libelle} valeur={v} choix={(c.options ?? []).map((o) => ({ valeur: o, libelle: o }))} />
            ) : (
              <TexteReponse
                rapportId={x.rapportId}
                champId={c.id}
                valeur={v}
                long={c.type === "texte_long"}
                type={c.type === "nombre" ? "nombre" : c.type === "date" ? "date" : "texte"}
                id={`r-${c.id}`}
                etiquette={idT}
                decritPar={c.aide ? idA : undefined}
              />
            )
          ) : (
            <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", whiteSpace: "pre-line" }}>{v || <span className="ton-discret">Sans réponse</span>}</p>
          )}
        </div>
      </section>
    );
  }

  // ---------- Repris des rapports reçus (rapport de chef) ----------
  if (c.type === "reprise") return <Reprise c={c} x={x} lignes={lignes} reponses={reponses} idT={idT} idA={idA} />;
  return null;
}

function Reprise({ c, x, lignes, reponses, idT, idA }: { c: Champ; x: ContexteRapport; lignes: LigneLue[]; reponses: ReponseLue[]; idT: string; idA: string }) {
  const saisie = x.mode === "saisie";
  const auteurs = (l: LigneLue) => l.auteursOrigine.map((id) => x.personnes.get(id) ?? { initiales: "?", nom: "" });

  if (x.mode === "apercu") {
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} glyphe />
        <Aide c={c} id={idA} x={x} />
        <p className="champ-rapport__corps apercu">
          {c.reprise === "a_decider"
            ? "Les blocages et les décisions attendues des rapports reçus ; le chef choisit ce qui remonte."
            : c.reprise === "sante"
              ? "Pour chaque projet, le feu le plus préoccupant de l'équipe ; le chef peut le changer."
              : c.reprise === "charge"
                ? "Le chef voit le ressenti et la charge calculée de chacun ; son supérieur ne reçoit que les nombres."
                : "Les lignes des rapports reçus, regroupées par projet, avec le nom de leurs auteurs."}
        </p>
      </section>
    );
  }

  if (c.reprise === "sante") {
    const avis = x.equipe?.sante.get(c.id);
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} nombre={saisie && avis ? avis.length : reponses.length} />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps">
          {saisie && avis ? (
            avis.length === 0 ? (
              <p className="vide" style={{ margin: 0 }}>
                Aucun feu dans les rapports reçus pour l'instant.
              </p>
            ) : (
              avis.map((p) => {
                const valeur = p.choisi || p.propose || "";
                return (
                  <fieldset key={p.projetId} className="feu">
                    <legend className="visuellement-cache">{p.titre}</legend>
                    <div className="feu__ligne">
                      <span className="feu__nom">
                        <span className="etiquette-projet">{p.code}</span>
                        <span className="rangee__texte">
                          <span className="rangee__titre">{p.titre}</span>
                          <span className="rangee__sous">{p.avis.map((a) => `${a.qui} : ${libelleSante(a.valeur).toLowerCase()}`).join(" · ")}</span>
                          {p.choisi && p.choisi !== p.propose ? <span className="rangee__sous ton-veille">Changé par vous : l'équipe disait « {libelleSante(p.propose).toLowerCase()} »</span> : null}
                        </span>
                      </span>
                      <ChoixSegmente
                        rapportId={x.rapportId}
                        champId={c.id}
                        projetId={p.projetId}
                        nom={`feu-${c.id}-${p.projetId}`}
                        libelle={`Santé de ${p.titre}`}
                        valeur={valeur}
                        choix={NIVEAUX_SANTE.map((n) => ({ valeur: n.valeur, libelle: n.libelle, ton: n.valeur === "en_retard" ? ("retard" as const) : undefined }))}
                      />
                    </div>
                  </fieldset>
                );
              })
            )
          ) : reponses.length === 0 ? (
            <p className="vide" style={{ margin: 0 }}>
              Aucun feu.
            </p>
          ) : (
            reponses.map((r) => (
              <div key={r.id} className="feu">
                <div className="feu__ligne">
                  <span className="feu__nom">
                    <span className="etiquette-projet">{r.projetCode}</span>
                    <span className="rangee__texte">
                      <span className="rangee__titre">{r.projetTitre}</span>
                      {r.commentaire ? <span className="rangee__sous">{r.commentaire}</span> : null}
                      {r.propose && r.valeur !== r.propose ? <span className="rangee__sous ton-veille">Changé par le chef : l'équipe disait « {libelleSante(r.propose).toLowerCase()} »</span> : null}
                    </span>
                  </span>
                  <span className={`pastille-sante pastille-sante--${r.valeur || "vide"}`}>{libelleSante(r.valeur)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  if (c.reprise === "charge") {
    const ch = saisie ? x.equipe?.charge : null;
    const fige = lireComptes(reponses[0]?.valeur);
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} glyphe />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps">
          {ch ? (
            <>
              <p className="note" style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                <Icone nom="cadenas" taille={14} /> Le détail reste à vous. {x.superieur ?? "Votre supérieur"} reçoit les nombres : {texteComptes(ch.comptes)}.
              </p>
              <ul className="liste">
                {ch.membres.map((m) => (
                  <li key={m.id} className="rangee" style={{ minHeight: 52, flexWrap: "wrap" }}>
                    <span className="mono mono--petit" aria-hidden="true">
                      {m.initiales}
                    </span>
                    <span className="rangee__texte" style={{ flex: "1 1 180px" }}>
                      <span className="rangee__titre">{m.nom}</span>
                      <span className="rangee__sous">
                        Calculé : {Math.round(m.heures)} h sur {m.capacite} h la semaine prochaine ({NIVEAU_CALCULE[m.niveau]})
                      </span>
                    </span>
                    <span className={`rangee__meta ${m.ressenti === "trop_lourde" ? "ton-retard" : ""}`}>{m.ressenti ? `Ressenti : ${libelleRessenti(m.ressenti).toLowerCase()}` : m.envoye ? "Ressenti non donné" : "Pas encore de rapport"}</span>
                  </li>
                ))}
                {ch.equipes.map((e) => (
                  <li key={e.qui} className="rangee" style={{ minHeight: 52 }}>
                    <span className="rangee__texte">
                      <span className="rangee__titre">Équipe de {e.qui}</span>
                      <span className="rangee__sous">{texteComptes(e.comptes)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : fige ? (
            <p style={{ margin: 0, fontSize: 15 }}>{texteComptes(fige)}.</p>
          ) : (
            <p className="vide" style={{ margin: 0 }}>
              Pas encore de chiffres.
            </p>
          )}
        </div>
      </section>
    );
  }

  // À décider, fait, en cours, prévu : des lignes reçues.
  const gardees = lignes.filter((l) => !l.retiree);
  const retirees = lignes.filter((l) => l.retiree);
  const aDecider = c.reprise === "a_decider";
  const groupes = new Map<string, { code: string; titre: string; lignes: LigneLue[] }>();
  if (!aDecider) {
    for (const l of gardees) {
      const k = l.projetId ?? "";
      const g = groupes.get(k) ?? { code: l.projetCode ?? "—", titre: l.projetTitre ?? "Hors projet", lignes: [] };
      g.lignes.push(l);
      groupes.set(k, g);
    }
  }
  const nRemontes = gardees.filter((l) => l.remonte).length;
  return (
    <section className="carte champ-rapport" aria-labelledby={idT}>
      <Titre c={c} x={x} id={idT} nombre={gardees.length} ton={aDecider && gardees.length ? "ton-veille" : ""} />
      <Aide c={c} id={idA} x={x} />
      {aDecider && gardees.length ? (
        <p className="champ-rapport__corps note" style={{ margin: "-4px 0 4px" }}>
          {nRemontes ? `${nRemontes} remonté${nRemontes > 1 ? "s" : ""}${x.superieur && saisie ? ` à ${x.superieur}` : ""}` : saisie ? "Rien ne remonte encore." : "Rien n'a été remonté."}
        </p>
      ) : null}
      <div className="champ-rapport__corps">
        {gardees.length === 0 ? (
          <p className="vide" style={{ margin: 0 }}>
            {aDecider ? "Rien de bloqué, aucune décision attendue dans les rapports reçus." : "Rien dans les rapports reçus."}
          </p>
        ) : aDecider ? (
          <ul className="liste">
            {gardees.map((l) => (
              <li key={l.id} className="recu">
                <div className="recu__ligne">
                  <span className="etiquette-projet" title={l.projetTitre ?? "Sans projet"}>
                    {l.projetCode ?? "—"}
                  </span>
                  <ul className="liste">
                    <LigneEditable ligne={l} projets={x.projets} modifiable={saisie} parProjet={false} auteurs={auteurs(l)} />
                  </ul>
                </div>
                {saisie ? (
                  <div className="recu__actions">
                    <InterrupteurRemonter ligneId={l.id} remonte={l.remonte} superieur={x.superieur} />
                  </div>
                ) : l.remonte ? (
                  <div className="recu__actions">
                    <span className="etiquette-auto">Remonté</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          [...groupes.values()].map((g) => (
            <div key={g.code + g.titre} className="groupe-projet">
              <h4 className="groupe-projet__titre">
                <span className="etiquette-projet">{g.code}</span>
                {g.titre}
              </h4>
              <ul className="liste">
                {g.lignes.map((l) => (
                  <LigneEditable key={l.id} ligne={l} projets={x.projets} modifiable={saisie} parProjet={false} auteurs={auteurs(l)} />
                ))}
              </ul>
            </div>
          ))
        )}
        {saisie && retirees.length ? (
          <details className="retirees">
            <summary>
              {retirees.length} élément{retirees.length > 1 ? "s" : ""} retiré{retirees.length > 1 ? "s" : ""} de votre rapport
            </summary>
            <ul className="liste">
              {retirees.map((l) => (
                <li key={l.id} className="rangee" style={{ minHeight: 48, flexWrap: "wrap" }}>
                  <span className="rangee__texte" style={{ flex: "1 1 220px" }}>
                    <span className="rangee__titre ton-discret">{l.texte}</span>
                  </span>
                  <BoutonRemettre ligneId={l.id} texte={l.texte} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
