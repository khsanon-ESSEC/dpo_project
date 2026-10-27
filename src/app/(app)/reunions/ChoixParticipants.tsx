"use client";

import { useMemo, useState } from "react";

type Personne = { id: string; nom: string; detail: string };

const plat = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Qui était là : une recherche et des cases à cocher. Les personnes choisies restent en tête, en
 * pastilles qu'on retire d'un geste. Les cases sont envoyées avec le formulaire (name="participants").
 */
export function ChoixParticipants({ personnes, choisis: initiaux }: { personnes: Personne[]; choisis: string[] }) {
  const [choisis, setChoisis] = useState<string[]>(initiaux);
  const [filtre, setFiltre] = useState("");
  const parId = useMemo(() => new Map(personnes.map((p) => [p.id, p])), [personnes]);
  const visibles = useMemo(() => {
    const f = plat(filtre.trim());
    return personnes.filter((p) => !f || plat(`${p.nom} ${p.detail}`).includes(f));
  }, [personnes, filtre]);
  const basculer = (id: string) => setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <fieldset className="participants">
      <legend>Avec qui (vous y êtes déjà)</legend>
      {choisis.length ? (
        <ul className="participants__choisis" aria-label="Participants choisis">
          {choisis.map((id) => (
            <li key={id}>
              <button type="button" className="pastille-personne" onClick={() => basculer(id)} aria-label={`Retirer ${parId.get(id)?.nom ?? ""}`}>
                {parId.get(id)?.nom ?? "?"} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="visuellement-cache" htmlFor="rp-filtre">
        Chercher une personne
      </label>
      <input id="rp-filtre" type="search" placeholder="Chercher un nom, une équipe" value={filtre} onChange={(e) => setFiltre(e.target.value)} autoComplete="off" />
      <div className="participants__liste" role="group" aria-label="Personnes">
        {visibles.map((p) => (
          <label key={p.id} className="participants__case">
            <input type="checkbox" name="participants" value={p.id} checked={choisis.includes(p.id)} onChange={() => basculer(p.id)} />
            <span className="participants__nom">{p.nom}</span>
            <span className="participants__detail">{p.detail}</span>
          </label>
        ))}
        {visibles.length === 0 ? <p className="vide" style={{ margin: 0, padding: "10px 12px" }}>Personne ne correspond.</p> : null}
      </div>
      {/* Les choisis masqués par la recherche restent envoyés. */}
      {choisis
        .filter((id) => !visibles.some((p) => p.id === id))
        .map((id) => (
          <input key={id} type="hidden" name="participants" value={id} />
        ))}
    </fieldset>
  );
}
