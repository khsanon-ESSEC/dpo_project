/**
 * Choix d'un programme ou d'une division dans les listes de référence (Organisation → Listes).
 * La valeur que le projet porte déjà reste proposée même si elle a été retirée de la liste.
 */
export function ChoixListe({
  id,
  name,
  libelle,
  valeurs,
  actuelle = "",
  vide,
  aide,
  lienListes,
}: {
  id: string;
  name: string;
  libelle: string;
  valeurs: string[];
  actuelle?: string;
  vide: string;
  aide?: string;
  /** Pour qui gère les listes : un lien pour ajouter une valeur manquante. */
  lienListes?: boolean;
}) {
  const cle = (s: string) => s.trim().toLocaleLowerCase("fr");
  const horsListe = actuelle && !valeurs.some((v) => cle(v) === cle(actuelle)) ? actuelle : null;
  const choisie = horsListe ?? valeurs.find((v) => cle(v) === cle(actuelle)) ?? "";
  const idAide = aide || lienListes ? `${id}-aide` : undefined;
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <select id={id} name={name} defaultValue={choisie} aria-describedby={idAide}>
        <option value="">{vide}</option>
        {horsListe ? <option value={horsListe}>{horsListe} (retiré de la liste)</option> : null}
        {valeurs.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {idAide ? (
        <span className="aide" id={idAide}>
          {aide}
          {aide && lienListes ? " " : ""}
          {lienListes ? (
            <a href="/organisation/listes" className="lien-discret">
              Gérer la liste
            </a>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
