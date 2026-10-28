"use client";

import { useMemo, useState } from "react";

type Personne = { id: string; nom: string; detail: string; externe?: boolean };
type Nouvelle = { nom: string; organisation: string };

const plat = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Qui était là : une recherche et des cases à cocher (la division, puis les personnes hors division
 * déjà connues). Les personnes choisies restent en tête, en pastilles qu'on retire d'un geste.
 * « Quelqu'un d'autre » ajoute une personne hors division (autre département, consultant) : sa fiche
 * est créée à l'enregistrement de la réunion. Envoyés : participants (identifiants), externes (JSON).
 */
export function ChoixParticipants({ personnes, choisis: initiaux, autresPermis = true }: { personnes: Personne[]; choisis: string[]; autresPermis?: boolean }) {
  const [choisis, setChoisis] = useState<string[]>(initiaux);
  const [nouvelles, setNouvelles] = useState<Nouvelle[]>([]);
  const [filtre, setFiltre] = useState("");
  const [ajout, setAjout] = useState<Nouvelle | null>(null);
  const parId = useMemo(() => new Map(personnes.map((p) => [p.id, p])), [personnes]);
  const visibles = useMemo(() => {
    const f = plat(filtre.trim());
    return personnes.filter((p) => !f || plat(`${p.nom} ${p.detail}`).includes(f));
  }, [personnes, filtre]);
  const basculer = (id: string) => setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const ajouter = () => {
    if (!ajout || !ajout.nom.trim()) return;
    setNouvelles((n) => [...n, { nom: ajout.nom.trim(), organisation: ajout.organisation.trim() }]);
    setAjout(null);
  };

  return (
    <fieldset className="participants">
      <legend>Avec qui (vous y êtes déjà)</legend>
      {choisis.length || nouvelles.length ? (
        <ul className="participants__choisis" aria-label="Participants choisis">
          {choisis.map((id) => (
            <li key={id}>
              <button type="button" className="pastille-personne" onClick={() => basculer(id)} aria-label={`Retirer ${parId.get(id)?.nom ?? ""}`}>
                {parId.get(id)?.nom ?? "?"} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
          {nouvelles.map((n, i) => (
            <li key={`n-${i}`}>
              <button type="button" className="pastille-personne pastille-personne--nouvelle" onClick={() => setNouvelles((l) => l.filter((_, j) => j !== i))} aria-label={`Retirer ${n.nom}`}>
                {n.nom}
                {n.organisation ? ` · ${n.organisation}` : ""} <span aria-hidden="true">×</span>
              </button>
              <input type="hidden" name="externes" value={JSON.stringify(n)} />
            </li>
          ))}
        </ul>
      ) : null}
      <label className="visuellement-cache" htmlFor="rp-filtre">
        Chercher une personne
      </label>
      <input id="rp-filtre" type="search" placeholder="Chercher un nom, une équipe, un département" value={filtre} onChange={(e) => setFiltre(e.target.value)} autoComplete="off" />
      <div className="participants__liste" role="group" aria-label="Personnes">
        {visibles.map((p, i) => (
          <div key={p.id}>
            {p.externe && (i === 0 || !visibles[i - 1].externe) ? <p className="participants__groupe">Hors division</p> : null}
            <label className="participants__case">
              <input type="checkbox" name="participants" value={p.id} checked={choisis.includes(p.id)} onChange={() => basculer(p.id)} />
              <span className="participants__nom">{p.nom}</span>
              <span className="participants__detail">{p.detail}</span>
            </label>
          </div>
        ))}
        {visibles.length === 0 ? (
          <p className="vide" style={{ margin: 0, padding: "10px 12px" }}>
            Personne ne correspond : ajoutez-la ci-dessous si elle est hors division.
          </p>
        ) : null}
      </div>
      {/* Les choisis masqués par la recherche restent envoyés. */}
      {choisis
        .filter((id) => !visibles.some((p) => p.id === id))
        .map((id) => (
          <input key={id} type="hidden" name="participants" value={id} />
        ))}
      {ajout ? (
        <div className="hors-liste__champs">
          <div className="champ">
            <label htmlFor="rp-ext-nom">Prénom et nom</label>
            <input
              id="rp-ext-nom"
              value={ajout.nom}
              onChange={(e) => setAjout({ ...ajout, nom: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouter();
                }
              }}
              maxLength={200}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="champ">
            <label htmlFor="rp-ext-org">Département ou société</label>
            <input
              id="rp-ext-org"
              value={ajout.organisation}
              onChange={(e) => setAjout({ ...ajout, organisation: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouter();
                }
              }}
              maxLength={120}
              placeholder="Ex. : DTI, Cabinet Atlas"
              autoComplete="off"
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 100%" }}>
            <button type="button" className="bouton-contour" onClick={ajouter} disabled={!ajout.nom.trim()}>
              Ajouter
            </button>
            <button type="button" className="lien-discret" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setAjout(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : autresPermis ? (
        <button type="button" className="lien-discret participants__autre" onClick={() => setAjout({ nom: filtre.trim(), organisation: "" })}>
          + Quelqu&apos;un d&apos;autre, hors division (autre département, consultant)
        </button>
      ) : null}
    </fieldset>
  );
}
