"use client";

import { useEffect, useState } from "react";
import { externesPermisPour, type PersonneChoix } from "@/components/ChoixPour";

type Action = { cle: number; titre: string; pour: string; echeance: string };

/**
 * Actions décidées en réunion : chaque ligne remplie devient une tâche (pour qui, pour quand), rattachée à la
 * réunion et à son projet. « Pour » suit les règles d'assignation, selon le projet choisi plus haut.
 */
export function ActionsReunion({
  moiId,
  personnes,
  base,
  parProjet,
  projetInitial,
}: {
  moiId: string;
  personnes: PersonneChoix[];
  base: string[];
  parProjet: Record<string, string[]>;
  projetInitial: string;
}) {
  const [projet, setProjet] = useState(projetInitial);
  const [actions, setActions] = useState<Action[]>([{ cle: 0, titre: "", pour: moiId, echeance: "" }]);

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
  const ids = new Set(choix.map((p) => p.id));

  // Une personne qui n'est plus permise (projet changé) revient à « Moi ».
  useEffect(() => {
    setActions((l) => (l.some((x) => !ids.has(x.pour)) ? l.map((x) => (ids.has(x.pour) ? x : { ...x, pour: moiId })) : l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projet]);

  const changer = (cle: number, champ: keyof Omit<Action, "cle">, v: string) => setActions((l) => l.map((x) => (x.cle === cle ? { ...x, [champ]: v } : x)));

  return (
    <fieldset className="actions-reunion">
      <legend>Actions décidées (facultatif)</legend>
      <p className="note" style={{ margin: "0 0 4px" }}>
        Chaque action devient une tâche, dans « À faire » de la personne choisie{projet ? ", sur le projet de la réunion" : ""}.
      </p>
      {actions.map((x, i) => (
        <div key={x.cle} className="actions-reunion__ligne">
          <label className="visuellement-cache" htmlFor={`action-${x.cle}`}>
            Action {i + 1}
          </label>
          <input id={`action-${x.cle}`} name="actionTitre" value={x.titre} onChange={(e) => changer(x.cle, "titre", e.target.value)} maxLength={200} placeholder="Ex. : Envoyer le compte rendu à la DTI" autoComplete="off" />
          <div className="actions-reunion__details">
            <label className="visuellement-cache" htmlFor={`action-pour-${x.cle}`}>
              Pour qui (action {i + 1})
            </label>
            <select id={`action-pour-${x.cle}`} name="actionPour" value={x.pour} onChange={(e) => changer(x.cle, "pour", e.target.value)}>
              {choix
                .filter((p) => !p.externe)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              {choix.some((p) => p.externe) ? (
                <optgroup label="Hors division">
                  {choix
                    .filter((p) => p.externe)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                        {p.organisation ? ` · ${p.organisation}` : ""}
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </select>
            <label className="visuellement-cache" htmlFor={`action-quand-${x.cle}`}>
              Pour quand (action {i + 1})
            </label>
            <input id={`action-quand-${x.cle}`} name="actionEcheance" type="date" value={x.echeance} onChange={(e) => changer(x.cle, "echeance", e.target.value)} />
            {actions.length > 1 ? (
              <button type="button" className="bouton-mini" onClick={() => setActions((l) => l.filter((y) => y.cle !== x.cle))} aria-label={`Retirer l'action ${i + 1}`}>
                Retirer
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {actions.length < 10 ? (
        <button type="button" className="lien-discret" style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setActions((l) => [...l, { cle: Math.max(...l.map((y) => y.cle)) + 1, titre: "", pour: moiId, echeance: "" }])}>
          + Une autre action
        </button>
      ) : null}
    </fieldset>
  );
}
