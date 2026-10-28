"use client";

import { useEffect, useState } from "react";
import { externesPermisPour, type PersonneChoix } from "@/components/ChoixPour";
import { SaisieLigne } from "@/components/SaisieLigne";

type Action = { cle: number };

/**
 * Actions décidées en réunion : une ligne par action, écrite comme dans la barre (« Envoyer le compte rendu
 * pour Fabienne vendredi », ou « @ » pour choisir la personne). Chaque ligne remplie devient une tâche, pour la
 * personne nommée (sinon pour soi), rattachée à la réunion et à son projet. On ne reconnaît que les personnes
 * permises par les règles d'assignation, selon le projet choisi plus haut ; le serveur les vérifie à nouveau.
 */
export function ActionsReunion({
  moiId,
  personnes,
  base,
  parProjet,
  projetInitial,
  aujourdhui,
}: {
  moiId: string;
  personnes: PersonneChoix[];
  base: string[];
  parProjet: Record<string, string[]>;
  projetInitial: string;
  aujourdhui: string;
}) {
  const [projet, setProjet] = useState(projetInitial);
  const [actions, setActions] = useState<Action[]>([{ cle: 0 }]);

  // Le projet se choisit dans le formulaire de la réunion (#r-projet) : on suit son changement.
  useEffect(() => {
    const select = document.getElementById("r-projet") as HTMLSelectElement | null;
    if (!select) return;
    const suivre = () => setProjet(select.value);
    select.addEventListener("change", suivre);
    return () => select.removeEventListener("change", suivre);
  }, []);

  const permis = new Set([...base, ...(parProjet[projet] ?? [])]);
  const externes = externesPermisPour(projet, parProjet, false, false);
  const choix = personnes.filter((p) => (p.externe ? externes || permis.has(p.id) : permis.has(p.id)));
  const moi = personnes.find((p) => p.id === moiId) ?? { id: moiId, nom: "Moi" };

  return (
    <fieldset className="actions-reunion">
      <legend>Actions décidées (facultatif)</legend>
      <p className="note" style={{ margin: "0 0 4px" }}>
        Une ligne par action : « Envoyer le compte rendu pour Fabienne vendredi », ou « @ » pour choisir la personne. Chaque action devient une tâche, pour la personne
        nommée (sinon pour vous){projet ? ", sur le projet de la réunion" : ""}.
      </p>
      {actions.map((x, i) => (
        <div key={x.cle} className="actions-reunion__ligne">
          <SaisieLigne
            id={`action-${x.cle}`}
            libelle={`Action ${i + 1}`}
            placeholder={i === 0 ? "Ex. : Envoyer le compte rendu pour Fabienne vendredi" : "Une autre action"}
            personnes={choix}
            moiId={moiId}
            aujourdhui={aujourdhui}
            pourDefaut={moi}
            noms={{ texte: "actionTitre", personne: "actionPour", echeance: "actionEcheance" }}
          />
          {actions.length > 1 ? (
            <button type="button" className="bouton-mini" style={{ alignSelf: "flex-start" }} onClick={() => setActions((l) => l.filter((y) => y.cle !== x.cle))} aria-label={`Retirer l'action ${i + 1}`}>
              Retirer
            </button>
          ) : null}
        </div>
      ))}
      {actions.length < 10 ? (
        <button type="button" className="lien-discret" style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setActions((l) => [...l, { cle: Math.max(...l.map((y) => y.cle)) + 1 }])}>
          + Une autre action
        </button>
      ) : null}
    </fieldset>
  );
}
