/**
 * Choisir une personne dans un formulaire de projet : la division d'abord, puis les personnes hors
 * division ; et, repliée, la saisie de quelqu'un qui n'est pas dans la liste (autre département,
 * consultant). Le formulaire envoie `${name}` (l'identifiant choisi) et, s'ils sont remplis,
 * `${prefixe}NomExterne` et `${prefixe}OrgExterne`, qui l'emportent sur la liste.
 */
export type PersonneListe = { id: string; nom: string; externe: boolean; organisation: string };

export function ChoixPersonne({
  id,
  name,
  prefixe,
  libelle,
  personnes,
  defaut,
  vide,
  horsDivision = true,
  aide,
}: {
  id: string;
  name: string;
  prefixe: string;
  libelle: string;
  personnes: PersonneListe[];
  defaut?: string | null;
  /** Libellé de l'option vide (« Choisir », « Aucun ») ; sans elle, pas d'option vide. */
  vide?: string;
  /** Proposer les personnes hors division et la saisie d'une nouvelle. */
  horsDivision?: boolean;
  aide?: string;
}) {
  const internes = personnes.filter((p) => !p.externe);
  const externes = horsDivision ? personnes.filter((p) => p.externe) : [];
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <select id={id} name={name} defaultValue={defaut ?? ""} aria-describedby={aide ? `${id}-aide` : undefined}>
        {vide ? <option value="">{vide}</option> : null}
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
      </select>
      {aide ? (
        <span className="aide" id={`${id}-aide`}>
          {aide}
        </span>
      ) : null}
      {horsDivision ? (
        <details className="hors-liste">
          <summary>Quelqu&apos;un qui n&apos;est pas dans la liste</summary>
          <div className="hors-liste__champs">
            <div className="champ">
              <label htmlFor={`${id}-nom`}>Prénom et nom</label>
              <input id={`${id}-nom`} name={`${prefixe}NomExterne`} maxLength={200} autoComplete="off" />
            </div>
            <div className="champ">
              <label htmlFor={`${id}-org`}>Département ou société</label>
              <input id={`${id}-org`} name={`${prefixe}OrgExterne`} maxLength={120} placeholder="Ex. : DTI, Cabinet Atlas" autoComplete="off" />
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
