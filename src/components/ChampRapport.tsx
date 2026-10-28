/**
 * Un champ du rapport, selon son type : en saisie (le brouillon), en lecture (un rapport envoyé),
 * ou en aperçu (l'éditeur de modèles). Les contrôles interactifs sont dans rapport/Lignes.tsx.
 */
import { deposer, redigerSynthese, retirer, suggererDecision } from "@/app/(app)/rapport/actions";
import { AjoutLigne, BoutonRemettre, CasePartie, ChoixSegmente, CommentaireFeu, InterrupteurRemonter, LigneEditable, TexteReponse } from "@/app/(app)/rapport/Lignes";
import { Icone } from "@/components/Icone";
import {
  CATALOGUE,
  estDecoratif,
  LIBELLE_RUBRIQUE,
  LIBELLE_VISIBILITE,
  libelleRessenti,
  libelleSante,
  lireComptes,
  lireReunions,
  NIVEAUX_RESSENTI,
  NIVEAUX_SANTE,
  texteComptes,
  type Champ,
  type ReunionsFigees,
} from "@/lib/modeles";
import { dateCourte, jourAbrege } from "@/lib/dates";
import { semainesDepuis } from "@/lib/lecture-rapport";
import { dureeTexte } from "@/lib/projets";
import type { AvisSante, ChargeMembre, LigneLue, MatiereSynthese, ReponseLue } from "@/lib/donnees/rapport";
import type { PieceLue } from "@/lib/donnees/pieces";
import type { ComptesCharge } from "@/lib/modeles";
import { ACCEPT, tailleLisible } from "@/lib/pieces";
import { CodeProjet, LienPersonne, LienProjet } from "@/components/Liens";

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
    /** Synthèse par projet : ce que l'équipe a envoyé, par champ. */
    synthese?: Map<string, MatiereSynthese[]>;
  } | null;
  /** Pièces jointes du rapport (sans contenu). */
  pieces?: PieceLue[];
  /** Un fichier refusé au dernier dépôt. */
  erreurPiece?: { champId: string; message: string } | null;
  /** « Décision ou aide attendue » : nombre de propositions possibles, par champ. */
  suggestions?: Map<string, number>;
  /** L'assistant d'IA est configuré. */
  ia?: boolean;
  /** Les titres des champs sont des h3 quand le formulaire a des intertitres. */
  niveauTitre: 2 | 3;
  /** Brouillon : les réunions de la semaine de l'auteur, telles qu'elles seront figées à l'envoi. */
  reunions?: ReunionsFigees | null;
  /** Lundi de la semaine du rapport. */
  semaine?: string;
  /** Projets que le lecteur peut ouvrir : leurs noms deviennent des liens. Absent (aperçu) : pas de liens. */
  projetsVisibles?: "tous" | Set<string>;
  /** Code → projet, pour les éléments qui ne gardent que le code (réunions figées dans le rapport). */
  codesProjets?: Map<string, { id: string; titre: string }>;
  /** Lecture : le rapport précédent existe (badges « Nouveau ») ; ses feux par projet (tendance). */
  precedent?: { sante: Map<string, string> } | null;
};

const voitProjet = (x: ContexteRapport, id: string | null | undefined) => !!id && !!x.projetsVisibles && (x.projetsVisibles === "tous" || x.projetsVisibles.has(id));

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

function Titre({ c, x, id, nombre, ton }: { c: Champ; x: ContexteRapport; id: string; nombre?: number | string | null; ton?: string; glyphe?: boolean }) {
  const H = x.niveauTitre === 3 ? "h3" : "h2";
  const remplissable = !estDecoratif(c) && !(c.type === "reprise" && (c.reprise === "sante" || c.reprise === "charge"));
  const montre = nombre !== undefined && nombre !== null && nombre !== 0 && nombre !== "";
  if (x.mode === "lecture") {
    return (
      <div className="champ-rapport__tete">
        <H id={id} className="champ-rapport__etiquette">
          {c.libelle}
          {montre ? <span className={ton}> · {nombre}</span> : null}
        </H>
        <Verrou c={c} />
      </div>
    );
  }
  return (
    <div className="champ-rapport__tete">
      <div className="champ-rapport__titre">
        <H id={id}>{c.libelle}</H>
        {nombre !== undefined && nombre !== null ? <span className={`champ-rapport__compte ${ton ?? ""}`}>{nombre}</span> : null}
        <Verrou c={c} />
        {!c.obligatoire && !estDecoratif(c) && c.type !== "reprise" ? <span className="ton-discret" style={{ fontSize: 12 }}>Facultatif</span> : null}
      </div>
      {x.mode === "saisie" && remplissable ? <CasePartie rapportId={x.rapportId} champId={c.id} relue={x.relues.has(c.id)} libelle={c.libelle} /> : null}
    </div>
  );
}

/** Une ligne compacte (charge, réunions, pièces jointes) : titre, résumé et témoin « Relu » sur une seule ligne. */
function TeteCompacte({ c, x, id, children }: { c: Champ; x: ContexteRapport; id: string; children: React.ReactNode }) {
  const H = x.niveauTitre === 3 ? "h3" : "h2";
  return (
    <div className="champ-compact">
      <H id={id} className="champ-compact__titre">
        {c.libelle}
      </H>
      <Verrou c={c} />
      {children}
      <CasePartie rapportId={x.rapportId} champId={c.id} relue={x.relues.has(c.id)} libelle={c.libelle} />
    </div>
  );
}

/** Lecture des lignes : les blocages et décisions avec leur ancienneté ; le reste regroupé par projet. */
function LignesLues({ c, x, lignes }: { c: Champ; x: ContexteRapport; lignes: LigneLue[] }) {
  const parProjet = c.parProjet !== false;
  const H = x.niveauTitre === 3 ? "h4" : "h3";
  const code = (l: { projetId: string | null; projetCode: string | null; projetTitre: string | null }) => (parProjet ? <CodeProjet id={l.projetId} code={l.projetCode ?? "—"} titre={l.projetTitre ?? "Sans projet"} visible={voitProjet(x, l.projetId)} /> : null);
  if (!lignes.length) {
    return (
      <p className="vide champ-rapport__corps" style={{ margin: 0 }}>
        {c.rubrique === "bloque" ? "Rien de bloqué." : c.rubrique === "decision" ? "Aucune décision attendue." : "Rien cette semaine."}
      </p>
    );
  }
  if (c.rubrique === "bloque" || c.rubrique === "decision") {
    const tri = [...lignes].sort((p, q) => Number(p.resolu) - Number(q.resolu));
    return (
      <ul className="liste champ-rapport__corps lignes-lues">
        {tri.map((l) => {
          const n = semainesDepuis(l.depuisSemaine, x.semaine);
          return (
            <li key={l.id} className={`ligne-lue${l.resolu ? " ligne-lue--resolue" : ""}`}>
              {code(l)}
              <span className="ligne-lue__texte">
                {l.texte}
                {l.resolu ? (
                  <span className="ligne-lue__sous">{n > 1 ? `Résolu cette semaine, après ${n} semaines` : "Résolu cette semaine"}</span>
                ) : n > 1 && l.depuisSemaine ? (
                  <span className="ligne-lue__sous">Reconduit · signalé pour la première fois la semaine du {dateCourte(l.depuisSemaine)}</span>
                ) : null}
              </span>
              {l.resolu ? (
                <span className="age-ligne age-ligne--resolu">Résolu</span>
              ) : n > 1 ? (
                <span className="age-ligne age-ligne--ancien">{n}ᵉ semaine</span>
              ) : x.precedent ? (
                <span className="age-ligne">Nouveau</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }
  const projets = new Set(lignes.map((l) => l.projetId ?? ""));
  if (parProjet && (c.rubrique === "fait" || c.rubrique === "en_cours") && lignes.length > 1 && projets.size < lignes.length) {
    const groupes = new Map<string, { id: string | null; code: string; titre: string; lignes: LigneLue[] }>();
    for (const l of lignes) {
      const k = l.projetId ?? "";
      const g = groupes.get(k) ?? { id: l.projetId, code: l.projetCode ?? "—", titre: l.projetTitre ?? "Sans projet", lignes: [] };
      g.lignes.push(l);
      groupes.set(k, g);
    }
    return (
      <div className="champ-rapport__corps">
        {[...groupes.values()].map((g) => (
          <div key={g.code + g.titre} className="groupe-projet">
            <H className="groupe-projet__titre">
              <CodeProjet id={g.id} code={g.code} titre={g.titre} visible={voitProjet(x, g.id)} />
              <LienProjet id={g.id} visible={voitProjet(x, g.id)}>
                {g.titre}
              </LienProjet>
            </H>
            <ul className="liste lignes-lues lignes-lues--puces">
              {g.lignes.map((l) => (
                <li key={l.id} className="ligne-lue">
                  <span className="ligne-lue__texte">{l.texte}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className="liste champ-rapport__corps lignes-lues">
      {lignes.map((l) => (
        <li key={l.id} className="ligne-lue">
          {code(l)}
          <span className="ligne-lue__texte">{l.texte}</span>
        </li>
      ))}
    </ul>
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
    const propres = lignes.filter((l) => l.origines.length === 0 && !l.retiree);
    const ouvertes = c.rubrique === "bloque" || c.rubrique === "decision" ? propres.filter((l) => !l.resolu) : propres;
    const attention = x.mode === "lecture" && c.rubrique === "decision" && ouvertes.length > 0;
    return (
      <section className={`carte champ-rapport${attention ? " champ-rapport--attention" : ""}`} aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} nombre={x.mode === "apercu" ? null : ouvertes.length} ton={c.rubrique === "bloque" && ouvertes.length ? "ton-veille" : ""} />
        <Aide c={c} id={idA} x={x} />
        <PropositionsDecision c={c} x={x} />
        {x.mode === "apercu" ? (
          <p className="champ-rapport__corps apercu">
            {c.prerempli && c.rubrique && c.rubrique !== "autre" ? `Préparé à partir des tâches : ${LIBELLE_RUBRIQUE[c.rubrique].toLowerCase()}.` : "La personne écrit ses lignes."}
            {c.parProjet !== false ? " Chaque ligne porte son projet." : ""}
            {c.rubrique === "decision" ? " Des propositions sont faites à partir des tâches bloquées et des échéances dépassées." : ""}
            {c.rubrique === "bloque" || c.rubrique === "decision" ? " Ce qui n'est pas marqué « Résolu » revient de lui-même la semaine suivante." : ""}
          </p>
        ) : saisie ? (
          propres.length ? (
            <ul className="liste champ-rapport__corps">
              {propres.map((l) => (
                <LigneEditable key={l.id} ligne={l} projets={x.projets} modifiable parProjet={c.parProjet !== false} projetVisible={voitProjet(x, l.projetId)} semaine={x.semaine} />
              ))}
            </ul>
          ) : null
        ) : (
          <LignesLues c={c} x={x} lignes={propres} />
        )}
        {saisie ? <AjoutLigne rapportId={x.rapportId} champId={c.id} libelle={c.libelle} projets={x.projets} parProjet={c.parProjet !== false} replie={propres.length > 0} /> : null}
      </section>
    );
  }

  // ---------- Santé des projets ----------
  if (c.type === "sante") {
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} />
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
                      <CodeProjet id={r.projetId} code={r.projetCode ?? "—"} titre={r.projetTitre} visible={voitProjet(x, r.projetId)} />
                      <span className="rangee__texte">
                        <span className="rangee__titre">
                          <LienProjet id={r.projetId} visible={voitProjet(x, r.projetId)}>
                            {r.projetTitre}
                          </LienProjet>
                        </span>
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
                      <span className="feu__lu">
                        <span className={`pastille-sante pastille-sante--${r.valeur || "vide"}`}>{libelleSante(r.valeur) || "Non noté"}</span>
                        <Tendance x={x} projetId={r.projetId} valeur={r.valeur} />
                      </span>
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
    if (saisie) {
      return (
        <section className="carte champ-rapport champ-rapport--compact" aria-labelledby={idT}>
          <TeteCompacte c={c} x={x} id={idT}>
            <ChoixSegmente
              rapportId={x.rapportId}
              champId={c.id}
              nom={`charge-${c.id}`}
              libelle={c.libelle}
              valeur={r?.valeur ?? ""}
              choix={NIVEAUX_RESSENTI.map((n) => ({ valeur: n.valeur, libelle: n.libelle, propose: r?.propose === n.valeur }))}
            />
            {r?.commentaire ? <span className="champ-compact__resume">calculé : {r.commentaire} prévues</span> : null}
          </TeteCompacte>
          {ecart ? <p className="note ton-veille" style={{ margin: 0 }}>Votre ressenti diffère du calcul : votre supérieur verra les deux. Une estimation de tâche à revoir ?</p> : null}
        </section>
      );
    }
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {x.mode === "apercu" ? (
            <p className="apercu">
              {NIVEAUX_RESSENTI.map((n) => n.libelle).join(", ")}.{c.prerempli ? " Proposé d'après les heures de tâches prévues ; la personne corrige si ce n'est pas son ressenti." : ""}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 15 }}>{libelleRessenti(r?.valeur) || "Non renseignée"}</p>
          )}
          {x.mode !== "apercu" && r?.commentaire ? (
            <span className="note">
              Calculé : {r.commentaire} de tâches prévues la semaine prochaine{r.propose ? ` (proposé : ${libelleRessenti(r.propose).toLowerCase()})` : ""}.
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  // ---------- Textes, choix, nombres, dates ----------
  if (c.type === "texte" || c.type === "texte_long" || c.type === "nombre" || c.type === "date" || c.type === "choix" || c.type === "echelle") {
    const v = reponses[0]?.valeur ?? "";
    return (
      <section className={`carte champ-rapport${x.mode === "lecture" && c.rubrique === "decision" && v.trim() ? " champ-rapport--attention" : ""}`} aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} />
        <Aide c={c} id={idA} x={x} />
        <PropositionsDecision c={c} x={x} />
        <div className="champ-rapport__corps">
          {x.mode === "apercu" ? (
            <p className="apercu">
              {c.type === "choix" || c.type === "echelle" ? `Une réponse parmi : ${(c.options ?? []).join(", ")}.` : `${CATALOGUE[c.type].nom}.`}
              {c.rubrique === "decision" ? " Repris en tête du rapport du chef, avec « À décider ». Des propositions sont faites à partir des tâches bloquées et des échéances dépassées." : ""}
            </p>
          ) : saisie ? (
            c.type === "choix" || c.type === "echelle" ? (
              <ChoixSegmente rapportId={x.rapportId} champId={c.id} nom={`choix-${c.id}`} libelle={c.libelle} valeur={v} choix={(c.options ?? []).map((o) => ({ valeur: o, libelle: o }))} />
            ) : (
              <TexteReponse
                key={v}
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
            <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", whiteSpace: "pre-line" }}>{v || <span className="ton-discret">{c.rubrique === "decision" ? "Aucune décision attendue." : "Sans réponse"}</span>}</p>
          )}
        </div>
      </section>
    );
  }

  // ---------- Réunions de la semaine ----------
  if (c.type === "reunions") {
    // Le brouillon (et son aperçu) montre la semaine en direct ; un rapport envoyé, la liste figée à l'envoi.
    const r = x.reunions !== undefined && x.reunions !== null ? x.reunions : saisie ? null : lireReunions(reponses[0]?.valeur);
    const n = r?.reunions.length ?? 0;
    const liste = n ? (
      <ul className="liste">
        {r!.reunions.map((m, i) => (
          <li key={i} className="rangee" style={{ minHeight: 44, gap: 12 }}>
            <span className="rangee__meta" style={{ width: 86, flex: "none", fontSize: 12 }}>
              {jourAbrege(m.jour)}
              {m.heure ? ` ${m.heure.replace(":", " h ")}` : ""}
            </span>
            {m.projet ? <CodeProjet id={x.codesProjets?.get(m.projet)?.id} code={m.projet} titre={x.codesProjets?.get(m.projet)?.titre} visible={voitProjet(x, x.codesProjets?.get(m.projet)?.id)} /> : null}
            <span className="rangee__texte">
              <span className="rangee__titre">{m.titre}</span>
              {m.avec ? <span className="rangee__sous">avec {m.avec} autre{m.avec > 1 ? "s" : ""} personne{m.avec > 1 ? "s" : ""}</span> : null}
            </span>
            <span className="rangee__meta">{dureeTexte(m.minutes)}</span>
          </li>
        ))}
      </ul>
    ) : null;
    if (saisie) {
      return (
        <section className="carte champ-rapport champ-rapport--compact" aria-labelledby={idT}>
          <TeteCompacte c={c} x={x} id={idT}>
            <span className="champ-compact__resume">{n ? `${dureeTexte(r!.minutes)} · ${n} réunion${n > 1 ? "s" : ""}, reprises du journal` : "aucune notée cette semaine"}</span>
            <a className="champ-compact__lien" href={`/reunions${x.semaine ? `?semaine=${x.semaine}` : ""}`}>
              Noter une réunion
            </a>
          </TeteCompacte>
          {n ? (
            <details className="champ-compact__detail">
              <summary>Voir le détail · figé à l&apos;envoi du rapport</summary>
              {liste}
            </details>
          ) : null}
        </section>
      );
    }
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} nombre={x.mode === "lecture" && n ? dureeTexte(r!.minutes) : null} />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {x.mode === "apercu" ? (
            <p className="apercu">Les réunions de la semaine, reprises du journal des réunions, avec leur durée totale. Figées à l&apos;envoi.</p>
          ) : n ? (
            liste
          ) : (
            <p className="vide" style={{ margin: 0 }}>
              Aucune réunion notée cette semaine.
            </p>
          )}
        </div>
      </section>
    );
  }

  // ---------- Pièces jointes ----------
  if (c.type === "piece_jointe") {
    const pieces = (x.pieces ?? []).filter((p) => p.champId === c.id);
    const erreur = x.erreurPiece?.champId === c.id ? x.erreurPiece.message : null;
    const liste = pieces.length ? (
      <ul className="liste">
        {pieces.map((p) => (
          <li key={p.id} className="piece">
            <Icone nom="trombone" taille={16} />
            <a href={`/api/pieces/${p.id}`} className="piece__nom" download>
              {p.nom}
            </a>
            <span className="piece__taille">{tailleLisible(p.taille)}</span>
            {saisie ? (
              <form action={retirer.bind(null, x.rapportId, p.id)}>
                <button type="submit" className="bouton-mini" aria-label={`Retirer ${p.nom}`}>
                  Retirer
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null;
    if (saisie) {
      return (
        <section className="carte champ-rapport champ-rapport--compact" aria-labelledby={idT}>
          <TeteCompacte c={c} x={x} id={idT}>
            <span className="champ-compact__resume">{pieces.length ? `${pieces.length} fichier${pieces.length > 1 ? "s" : ""}` : "aucune"}</span>
          </TeteCompacte>
          {liste}
          {erreur ? (
            <p className="erreur" role="alert" style={{ margin: 0 }}>
              {erreur}
            </p>
          ) : null}
          <details className="champ-compact__detail" open={!!erreur}>
            <summary>Joindre un fichier</summary>
            <form action={deposer.bind(null, x.rapportId, c.id)} className="piece__depot">
              <label htmlFor={`fichiers-${c.id}`} className="visuellement-cache">
                Fichiers à joindre à « {c.libelle} »
              </label>
              <input id={`fichiers-${c.id}`} name="fichiers" type="file" multiple accept={ACCEPT} aria-describedby={`fichiers-aide-${c.id}`} />
              <button type="submit" className="bouton-contour">
                <Icone nom="trombone" taille={16} /> Joindre
              </button>
              <span className="aide" id={`fichiers-aide-${c.id}`}>
                PDF, images, Word, Excel, PowerPoint, CSV ou texte · 10 Mo au plus par fichier
              </span>
            </form>
          </details>
        </section>
      );
    }
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} nombre={x.mode === "apercu" ? null : pieces.length} />
        <Aide c={c} id={idA} x={x} />
        <div className="champ-rapport__corps" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {x.mode === "apercu" ? (
            <p className="apercu">La personne joint des fichiers : PDF, images, Word, Excel, PowerPoint, CSV ou texte ; 10 Mo au plus chacun, dix au plus.</p>
          ) : (
            liste ?? (
              <p className="vide" style={{ margin: 0 }}>
                Aucun fichier.
              </p>
            )
          )}
        </div>
      </section>
    );
  }

  // ---------- Synthèse par projet (rapport de chef) ----------
  if (c.type === "synthese") return <Synthese c={c} x={x} reponses={reponses} idT={idT} idA={idA} />;

  // ---------- Repris des rapports reçus (rapport de chef) ----------
  if (c.type === "reprise") return <Reprise c={c} x={x} lignes={lignes} reponses={reponses} idT={idT} idA={idA} />;
  return null;
}

const RANG: Record<string, number> = { dans_les_temps: 0, a_surveiller: 1, en_retard: 2 };

/** Lecture d'un feu : comment il a bougé depuis le rapport précédent. */
function Tendance({ x, projetId, valeur }: { x: ContexteRapport; projetId: string | null; valeur: string }) {
  // Sans feux la semaine dernière (ancien modèle), pas de tendance.
  if (x.mode !== "lecture" || !x.precedent?.sante.size || !projetId || !valeur) return null;
  const avant = x.precedent.sante.get(projetId);
  if (!avant) return <span className="tendance">nouveau</span>;
  if (avant === valeur) return <span className="tendance">= inchangé</span>;
  const pire = (RANG[valeur] ?? 0) > (RANG[avant] ?? 0);
  return (
    <span className={`tendance ${pire ? "tendance--pire" : "tendance--mieux"}`}>
      {pire ? "↘" : "↗"} était « {libelleSante(avant)} »
    </span>
  );
}

/** « Décision ou aide attendue » : propositions tirées des tâches bloquées et des échéances dépassées. */
function PropositionsDecision({ c, x }: { c: Champ; x: ContexteRapport }) {
  const n = x.suggestions?.get(c.id) ?? 0;
  if (x.mode !== "saisie" || c.rubrique !== "decision" || c.partie === "equipe" || !n) return null;
  return (
    <div className="champ-rapport__corps proposition">
      <Icone nom="etincelle" taille={16} />
      <span className="proposition__texte">
        {n} proposition{n > 1 ? "s" : ""} à partir de vos tâches bloquées et de vos échéances dépassées.
      </span>
      <span className="proposition__actions">
        <form action={suggererDecision.bind(null, x.rapportId, c.id, false)}>
          <button type="submit" className="bouton-mini">
            <Icone nom="ajouter" taille={14} /> Ajouter
          </button>
        </form>
        {x.ia ? (
          <form action={suggererDecision.bind(null, x.rapportId, c.id, true)}>
            <button type="submit" className="bouton-mini">
              <Icone nom="etincelle" taille={14} /> Formuler avec l&apos;assistant
            </button>
          </form>
        ) : null}
      </span>
    </div>
  );
}

const LIBELLE_ELEMENT: Record<string, string> = { fait: "Fait", en_cours: "En cours", bloque: "À décider", decision: "À décider", prochaine: "Ensuite" };

function Synthese({ c, x, reponses, idT, idA }: { c: Champ; x: ContexteRapport; reponses: ReponseLue[]; idT: string; idA: string }) {
  const saisie = x.mode === "saisie";
  if (x.mode === "apercu") {
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} />
        <Aide c={c} id={idA} x={x} />
        <p className="champ-rapport__corps apercu">
          Pour chaque projet dont parlent les rapports reçus : quelques phrases préparées à partir de ce que l&apos;équipe a envoyé (ou des synthèses des chefs d&apos;équipe). Le chef les relit, les reformule ou les fait rédiger par l&apos;assistant. Seul ce que les lecteurs de ce champ pouvaient déjà lire y entre.
        </p>
      </section>
    );
  }
  const matiere = saisie ? (x.equipe?.synthese?.get(c.id) ?? []) : [];
  const projets = saisie
    ? matiere.map((m) => ({ projetId: m.projetId, code: m.code, titre: m.titre, m: m as MatiereSynthese | undefined, r: reponses.find((r) => r.projetId === m.projetId) }))
    : reponses.filter((r) => r.projetId && r.valeur.trim()).map((r) => ({ projetId: r.projetId!, code: r.projetCode ?? "—", titre: r.projetTitre ?? "", m: undefined as MatiereSynthese | undefined, r: r as ReponseLue | undefined }));
  return (
    <section className="carte champ-rapport" aria-labelledby={idT}>
      <Titre c={c} x={x} id={idT} nombre={projets.length} />
      <Aide c={c} id={idA} x={x} />
      <div className="champ-rapport__corps" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {projets.length === 0 ? (
          <p className="vide" style={{ margin: 0 }}>
            {saisie ? "Pas encore de rapport reçu qui parle d'un projet." : "Aucune synthèse."}
          </p>
        ) : (
          projets.map(({ projetId, code, titre, m, r }) => {
            const idP = `syn-${c.id}-${projetId}`;
            const valeur = r?.valeur ?? "";
            return (
              <div key={projetId} className="synthese">
                <h4 className="groupe-projet__titre" id={`${idP}-t`}>
                  <CodeProjet id={projetId} code={code} titre={titre} visible={voitProjet(x, projetId)} />
                  <LienProjet id={projetId} visible={voitProjet(x, projetId)}>
                    {titre}
                  </LienProjet>
                </h4>
                {saisie ? (
                  <>
                    <TexteReponse key={valeur} rapportId={x.rapportId} champId={c.id} projetId={projetId} valeur={valeur} long lignes={4} max={1500} id={idP} etiquette={`${idP}-t`} />
                    <div className="synthese__pied">
                      <span className="rangee__sous">
                        {r?.proposeParIa && valeur === r.propose ? "Rédigé par l'assistant, à relire" : r?.propose && valeur === r.propose ? "Préparé à partir des rapports reçus, à relire" : valeur ? "Votre texte" : ""}
                      </span>
                      {x.ia ? (
                        <form action={redigerSynthese.bind(null, x.rapportId, c.id, projetId)}>
                          <button type="submit" className="bouton-mini">
                            <Icone nom="etincelle" taille={14} /> Rédiger avec l&apos;assistant
                          </button>
                        </form>
                      ) : null}
                    </div>
                    {m && m.elements.length + m.recues.length ? (
                      <details className="retirees">
                        <summary>Ce que l&apos;équipe a envoyé ({m.elements.length + m.recues.length})</summary>
                        <ul className="liste">
                          {m.recues.map((e, i) => (
                            <li key={`r${i}`} className="synthese__element">
                              <span className="etiquette-auto">Synthèse</span> {e.texte} <span className="ton-discret">— {e.qui}</span>
                            </li>
                          ))}
                          {m.elements.map((e, i) => (
                            <li key={i} className="synthese__element">
                              <span className="etiquette-auto">{LIBELLE_ELEMENT[e.rubrique ?? ""] ?? "Autre"}</span> {e.texte} {e.qui ? <span className="ton-discret">— {e.qui}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", whiteSpace: "pre-line" }}>{valeur}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}


function Reprise({ c, x, lignes, reponses, idT, idA }: { c: Champ; x: ContexteRapport; lignes: LigneLue[]; reponses: ReponseLue[]; idT: string; idA: string }) {
  const saisie = x.mode === "saisie";
  const auteurs = (l: LigneLue) => l.auteursOrigine.map((id) => ({ id: x.mode === "apercu" ? undefined : id, ...(x.personnes.get(id) ?? { initiales: "?", nom: "" }) }));

  if (x.mode === "apercu") {
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} />
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
    // Aperçu d'un brouillon de chef : les feux tels qu'ils seront figés à l'envoi.
    const lues: { id: string; projetId: string | null; projetCode: string | null; projetTitre: string | null; valeur: string; propose: string | null; commentaire: string | null }[] =
      !saisie && avis
        ? avis.filter((p) => p.choisi || p.propose).map((p) => ({ id: p.projetId, projetId: p.projetId, projetCode: p.code, projetTitre: p.titre, valeur: p.choisi || p.propose || "", propose: p.propose, commentaire: p.avis.map((a) => `${a.qui} : ${libelleSante(a.valeur).toLowerCase()}`).join(" · ") }))
        : reponses;
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} nombre={saisie && avis ? avis.length : lues.length} />
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
                        <CodeProjet id={p.projetId} code={p.code} titre={p.titre} visible={voitProjet(x, p.projetId)} />
                        <span className="rangee__texte">
                          <span className="rangee__titre">
                            <LienProjet id={p.projetId} visible={voitProjet(x, p.projetId)}>
                              {p.titre}
                            </LienProjet>
                          </span>
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
          ) : lues.length === 0 ? (
            <p className="vide" style={{ margin: 0 }}>
              Aucun feu.
            </p>
          ) : (
            lues.map((r) => (
              <div key={r.id} className="feu">
                <div className="feu__ligne">
                  <span className="feu__nom">
                    <CodeProjet id={r.projetId} code={r.projetCode ?? "—"} titre={r.projetTitre} visible={voitProjet(x, r.projetId)} />
                    <span className="rangee__texte">
                      <span className="rangee__titre">
                        <LienProjet id={r.projetId} visible={voitProjet(x, r.projetId)}>
                          {r.projetTitre}
                        </LienProjet>
                      </span>
                      {r.commentaire ? <span className="rangee__sous">{r.commentaire}</span> : null}
                      {r.propose && r.valeur !== r.propose ? <span className="rangee__sous ton-veille">Changé par le chef : l'équipe disait « {libelleSante(r.propose).toLowerCase()} »</span> : null}
                    </span>
                  </span>
                  <span className="feu__lu">
                    <span className={`pastille-sante pastille-sante--${r.valeur || "vide"}`}>{libelleSante(r.valeur)}</span>
                    <Tendance x={x} projetId={r.projetId} valeur={r.valeur} />
                  </span>
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
    const fige = lireComptes(reponses[0]?.valeur) ?? (!saisie && x.equipe ? x.equipe.charge.comptes : null);
    return (
      <section className="carte champ-rapport" aria-labelledby={idT}>
        <Titre c={c} x={x} id={idT} />
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
                      <span className="rangee__titre">
                        <LienPersonne id={m.id}>{m.nom}</LienPersonne>
                      </span>
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
  const groupes = new Map<string, { id: string | null; code: string; titre: string; lignes: LigneLue[] }>();
  if (!aDecider) {
    for (const l of gardees) {
      const k = l.projetId ?? "";
      const g = groupes.get(k) ?? { id: l.projetId, code: l.projetCode ?? "—", titre: l.projetTitre ?? "Hors projet", lignes: [] };
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
                  <CodeProjet id={l.projetId} code={l.projetCode ?? "—"} titre={l.projetTitre ?? "Sans projet"} visible={voitProjet(x, l.projetId)} />
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
                <CodeProjet id={g.id} code={g.code} titre={g.titre} visible={voitProjet(x, g.id)} />
                <LienProjet id={g.id} visible={voitProjet(x, g.id)}>
                  {g.titre}
                </LienProjet>
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
