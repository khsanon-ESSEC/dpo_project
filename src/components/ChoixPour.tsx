"use client";

/**
 * « Pour » d'une tâche : les personnes de la division qu'on peut choisir, puis celles hors division
 * (autres départements, consultants) quand c'est permis, et « Quelqu'un d'autre » pour en ajouter une.
 * La nouvelle personne part avec le formulaire : pourNomExterne, pourOrgExterne.
 */
import { NOUVELLE_PERSONNE } from "@/lib/projets";
export { NOUVELLE_PERSONNE };

export type PersonneChoix = { id: string; nom: string; externe?: boolean; organisation?: string };

export function ChoixPour({
  id,
  libelle = "Pour",
  personnes,
  permis,
  externesPermis,
  valeur,
  onChange,
}: {
  id: string;
  libelle?: string;
  personnes: PersonneChoix[];
  /** Personnes de la division qu'on peut choisir ici. */
  permis: Set<string>;
  /** Les personnes hors division peuvent-elles recevoir cette tâche (hors projet, projet qu'on dirige, direction) ? */
  externesPermis: boolean;
  valeur: string;
  onChange: (v: string) => void;
}) {
  const internes = personnes.filter((p) => !p.externe && permis.has(p.id));
  const externes = personnes.filter((p) => p.externe && (externesPermis || permis.has(p.id)));
  return (
    <>
      <div className="champ">
        <label htmlFor={id}>{libelle}</label>
        <select id={id} name="assigneId" value={valeur} onChange={(e) => onChange(e.target.value)}>
          {internes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
          {externes.length ? (
            <optgroup label="Hors division">
              {externes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                  {p.organisation ? ` · ${p.organisation}` : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
          {externesPermis ? <option value={NOUVELLE_PERSONNE}>Quelqu&apos;un d&apos;autre, hors division…</option> : null}
        </select>
      </div>
      {valeur === NOUVELLE_PERSONNE ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div className="champ" style={{ flex: "1 1 180px" }}>
            <label htmlFor={`${id}-nom`}>Prénom et nom</label>
            <input id={`${id}-nom`} name="pourNomExterne" required maxLength={200} autoComplete="off" />
          </div>
          <div className="champ" style={{ flex: "1 1 180px" }}>
            <label htmlFor={`${id}-org`}>Département ou société</label>
            <input id={`${id}-org`} name="pourOrgExterne" maxLength={120} placeholder="Ex. : DTI, Cabinet Atlas" autoComplete="off" />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Les personnes hors division peuvent-elles recevoir une tâche de ce projet (« » = hors projet) ? */
export function externesPermisPour(projet: string, parProjet: Record<string, string[]>, externesPartout: boolean): boolean {
  return externesPartout || projet === "" || projet in parProjet;
}
