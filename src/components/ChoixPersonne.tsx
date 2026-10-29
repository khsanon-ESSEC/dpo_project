/**
 * Choisir une personne dans un formulaire de projet : on tape le nom pour la trouver (la division d'abord,
 * puis les personnes hors division) ; et, repliée, la saisie de quelqu'un qui n'est pas dans la liste
 * (autre département, consultant). Le formulaire envoie `${name}` (l'identifiant choisi) et, s'ils sont
 * remplis, `${prefixe}NomExterne` et `${prefixe}OrgExterne`, qui l'emportent sur la liste.
 */
import { ListeFiltrable, type OptionListe } from "./ListeFiltrable";

export type PersonneListe = { id: string; nom: string; externe: boolean; organisation: string; poste?: string };

/** Les personnes en options de liste : la division, puis « Hors division » avec leur organisation. */
export function optionsPersonnes(personnes: { id: string; nom: string; externe?: boolean; organisation?: string; poste?: string }[], horsDivision = true): OptionListe[] {
  const internes = personnes.filter((p) => !p.externe).map((p) => ({ value: p.id, label: p.nom, detail: p.poste || undefined }));
  const externes = horsDivision ? personnes.filter((p) => p.externe).map((p) => ({ value: p.id, label: p.nom, detail: p.organisation || undefined, groupe: "Hors division" })) : [];
  return [...internes, ...externes];
}

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
  /** Libellé du choix vide (« Choisir », « Aucun ») ; sans lui, pas de choix vide. */
  vide?: string;
  /** Proposer les personnes hors division et la saisie d'une nouvelle. */
  horsDivision?: boolean;
  aide?: string;
}) {
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <ListeFiltrable
        id={id}
        name={name}
        options={optionsPersonnes(personnes, horsDivision)}
        defaultValue={defaut ?? ""}
        vide={vide}
        placeholder={vide ? `${vide} (tapez un nom)` : "Tapez un nom"}
        describedBy={aide ? `${id}-aide` : undefined}
        aucun="Personne ne correspond à"
      />
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
