"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  basculerPartieRelue,
  basculerRemonte,
  changerProjetLigne,
  commenter,
  modifierLigne,
  remettreLigne,
  repondre,
  supprimerLigne,
} from "./actions";
import { CocheSeule } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";

type Ligne = { id: string; texte: string; projetId: string | null; projetCode: string | null; projetTitre: string | null };
type Projet = { id: string; code: string; titre: string };

/** Une ligne du rapport : texte modifiable, projet, retrait. Les éléments reçus gardent le nom de leurs auteurs. */
export function LigneEditable({
  ligne,
  projets,
  modifiable,
  parProjet = true,
  auteurs,
}: {
  ligne: Ligne;
  projets: Projet[];
  modifiable: boolean;
  parProjet?: boolean;
  /** Élément reçu de l'équipe : initiales de ses auteurs (il se retire, il ne se supprime pas). */
  auteurs?: { initiales: string; nom: string }[];
}) {
  const [texte, setTexte] = useState(ligne.texte);
  const [, demarrer] = useTransition();
  const recu = !!auteurs;
  const Auteurs = recu ? (
    <span style={{ display: "inline-flex", gap: 3, flex: "none" }}>
      {auteurs!.map((a) => (
        <span key={a.initiales} className="initiales" title={a.nom}>
          {a.initiales}
        </span>
      ))}
    </span>
  ) : null;
  if (!modifiable) {
    return (
      <li style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "6px 0", borderTop: 0, fontSize: 15, lineHeight: "22px" }}>
        {parProjet ? (
          <span className="etiquette-projet" title={ligne.projetTitre ?? "Sans projet"}>
            {ligne.projetCode ?? "—"}
          </span>
        ) : null}
        <span style={{ flex: 1, minWidth: 0 }}>{ligne.texte}</span>
        {Auteurs}
      </li>
    );
  }
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderTop: 0 }}>
      {parProjet && !recu ? (
        <>
          <label className="visuellement-cache" htmlFor={`projet-${ligne.id}`}>
            Projet de la ligne « {ligne.texte} »
          </label>
          <select
            id={`projet-${ligne.id}`}
            defaultValue={ligne.projetId ?? ""}
            title={ligne.projetTitre ?? "Sans projet : seul votre supérieur voit cette ligne"}
            onChange={(e) => demarrer(() => changerProjetLigne(ligne.id, e.target.value || null))}
            style={{ width: 64, flex: "none", minHeight: 32, border: "1px solid var(--filet-fort)", background: "transparent", color: "var(--discret)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
          >
            <option value="">—</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </>
      ) : parProjet ? (
        <span className="etiquette-projet" title={ligne.projetTitre ?? "Sans projet"}>
          {ligne.projetCode ?? "—"}
        </span>
      ) : null}
      <label className="visuellement-cache" htmlFor={`texte-${ligne.id}`}>
        Texte de la ligne
      </label>
      <input
        id={`texte-${ligne.id}`}
        value={texte}
        maxLength={500}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => {
          if (texte.trim() !== ligne.texte) demarrer(() => modifierLigne(ligne.id, texte));
        }}
        style={{ flex: 1, minWidth: 0, minHeight: 40, padding: "0 10px", border: "1px solid transparent", background: "transparent", fontSize: 15 }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--filet-fort)")}
      />
      {Auteurs}
      <button
        type="button"
        className="bouton-icone"
        style={{ width: 36, height: 36 }}
        aria-label={recu ? `Retirer de mon rapport : « ${ligne.texte} »` : `Supprimer « ${ligne.texte} »`}
        title={recu ? "Retirer de mon rapport" : "Supprimer"}
        onClick={() => demarrer(() => supprimerLigne(ligne.id))}
      >
        <Icone nom="fermer" taille={16} />
      </button>
    </li>
  );
}

export function BoutonRemettre({ ligneId, texte }: { ligneId: string; texte: string }) {
  const [enCours, demarrer] = useTransition();
  return (
    <button type="button" className="bouton-mini" disabled={enCours} aria-label={`Remettre « ${texte} »`} onClick={() => demarrer(() => remettreLigne(ligneId))}>
      <Icone nom="reprendre" taille={14} /> Remettre
    </button>
  );
}

/** Rapport de chef : « Remonter » met un élément à décider en tête du rapport de son supérieur. */
export function InterrupteurRemonter({ ligneId, remonte, superieur }: { ligneId: string; remonte: boolean; superieur: string | null }) {
  const [enCours, demarrer] = useTransition();
  const [coche, setCoche] = useOptimistic(remonte);
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, flex: "none", fontSize: 12, color: "var(--discret)", cursor: "pointer" }}>
      {superieur ? `Remonter à ${superieur}` : "Remonter"}
      <input
        type="checkbox"
        className="interrupteur"
        checked={coche}
        disabled={enCours}
        onChange={() =>
          demarrer(async () => {
            setCoche(!coche);
            await basculerRemonte(ligneId);
          })
        }
      />
    </label>
  );
}

export function CasePartie({ rapportId, champId, relue, libelle }: { rapportId: string; champId: string; relue: boolean; libelle: string }) {
  const [enCours, demarrer] = useTransition();
  const [coche, setCoche] = useOptimistic(relue);
  return (
    <button
      type="button"
      className="case-ronde"
      style={{ width: "auto", padding: "0 4px 0 12px", gap: 10, color: "var(--discret)", fontSize: 13, marginLeft: 0 }}
      aria-pressed={coche}
      aria-label={`« ${libelle} » relu`}
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          setCoche(!coche);
          await basculerPartieRelue(rapportId, champId);
        })
      }
    >
      {coche ? "Relu" : "À relire"}
      <span className="case-ronde__rond">{coche ? <CocheSeule /> : null}</span>
    </button>
  );
}

type Choix = { valeur: string; libelle: string; propose?: boolean; ton?: "retard" };

/** Choix segmenté : de vrais boutons radio, enregistrés dès qu'on choisit. */
export function ChoixSegmente({
  rapportId,
  champId,
  projetId = null,
  nom,
  choix,
  valeur,
  libelle,
  pleine,
  modifiable = true,
}: {
  rapportId: string;
  champId: string;
  projetId?: string | null;
  nom: string;
  choix: Choix[];
  valeur: string;
  libelle: string;
  pleine?: boolean;
  modifiable?: boolean;
}) {
  const [, demarrer] = useTransition();
  const [courant, setCourant] = useOptimistic(valeur);
  return (
    <span role="radiogroup" aria-label={libelle} className={`segmente${pleine ? " segmente--pleine" : ""}`}>
      {choix.map((c) => (
        <label key={c.valeur} className={`segmente__choix${c.ton === "retard" ? " segmente__choix--retard" : ""}`}>
          <input
            type="radio"
            name={nom}
            value={c.valeur}
            checked={courant === c.valeur}
            disabled={!modifiable}
            onChange={() =>
              demarrer(async () => {
                setCourant(c.valeur);
                await repondre(rapportId, champId, projetId, c.valeur);
              })
            }
          />
          {c.libelle}
          {c.propose ? <span className="segmente__propose">proposé</span> : null}
        </label>
      ))}
    </span>
  );
}

/** Texte libre, enregistré en quittant le champ. */
export function TexteReponse({
  rapportId,
  champId,
  valeur,
  long,
  id,
  decritPar,
  etiquette,
  type = "texte",
}: {
  rapportId: string;
  champId: string;
  valeur: string;
  long?: boolean;
  id: string;
  decritPar?: string;
  /** Identifiant du titre qui sert d'étiquette. */
  etiquette?: string;
  type?: "texte" | "nombre" | "date";
}) {
  const [texte, setTexte] = useState(valeur);
  const [, demarrer] = useTransition();
  const enregistrer = (v: string) => {
    if (v.trim() !== valeur) demarrer(() => repondre(rapportId, champId, null, v));
  };
  const style = { width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", border: "1px solid var(--controle)", background: "var(--champ)", color: "var(--encre)", fontSize: 15, lineHeight: "22px" };
  if (long) {
    return <textarea id={id} aria-labelledby={etiquette} aria-describedby={decritPar} rows={3} value={texte} maxLength={2000} onChange={(e) => setTexte(e.target.value)} onBlur={() => enregistrer(texte)} style={{ ...style, resize: "vertical" }} />;
  }
  return (
    <input
      id={id}
      aria-labelledby={etiquette}
      aria-describedby={decritPar}
      type={type === "nombre" ? "text" : type === "date" ? "date" : "text"}
      inputMode={type === "nombre" ? "decimal" : undefined}
      value={texte}
      maxLength={300}
      onChange={(e) => {
        setTexte(e.target.value);
        if (type === "date") enregistrer(e.target.value);
      }}
      onBlur={() => type !== "date" && enregistrer(texte)}
      style={{ ...style, minHeight: 44, maxWidth: type === "texte" ? "100%" : 220 }}
    />
  );
}

/** Feu : une phrase pour expliquer ce qui n'est pas « dans les temps ». */
export function CommentaireFeu({ rapportId, champId, projetId, valeur, id }: { rapportId: string; champId: string; projetId: string; valeur: string; id: string }) {
  const [texte, setTexte] = useState(valeur);
  const [, demarrer] = useTransition();
  return (
    <input
      id={id}
      value={texte}
      maxLength={300}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        if (texte.trim() !== valeur) demarrer(() => commenter(rapportId, champId, projetId, texte));
      }}
      style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px", border: "1px solid var(--controle)", background: "var(--champ)", color: "var(--encre)", fontSize: 14 }}
    />
  );
}
