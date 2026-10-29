"use client";

/**
 * Une liste où l'on tape pour trouver (combobox, motif ARIA « liste avec saisie ») :
 * - choix dans la liste (une personne) : le texte filtre les options, sans tenir compte des accents ni des
 *   majuscules ; le formulaire envoie `name` = la valeur choisie (champ caché) ;
 * - saisie libre avec suggestions (`libre`, un rôle) : les valeurs existantes sont proposées pendant qu'on tape ;
 *   une valeur nouvelle est gardée telle quelle et existera dès l'enregistrement.
 * Clavier : flèches haut et bas, Entrée pour choisir, Échap pour fermer ; Alt + flèche bas ouvre la liste.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type OptionListe = { value: string; label: string; detail?: string; groupe?: string };
const SANS: OptionListe[] = [];

const plier = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function ListeFiltrable({
  id,
  name,
  options,
  defaultValue = "",
  value,
  onChange,
  placeholder,
  vide,
  libre = false,
  required,
  maxLength,
  describedBy,
  nouveau = "Nouveau",
  fin = SANS,
  aucun = "Rien ne correspond à",
  disabled,
  className,
}: {
  id: string;
  name: string;
  options: OptionListe[];
  defaultValue?: string;
  /** Valeur contrôlée (avec onChange) ; sinon defaultValue. */
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  /** Libellé d'un choix vide (« Aucun ») ; sans lui, pas de choix vide. */
  vide?: string;
  /** Saisie libre avec suggestions : la valeur est le texte tapé. */
  libre?: boolean;
  required?: boolean;
  maxLength?: number;
  describedBy?: string;
  /** En saisie libre, le libellé devant une valeur qui n'existe pas encore. */
  nouveau?: string;
  /** Choix toujours proposés en fin de liste, quoi qu'on tape (« Quelqu'un d'autre… »). */
  fin?: OptionListe[];
  /** Quand rien ne correspond : « Personne ne correspond à ». */
  aucun?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [interne, setInterne] = useState(value ?? defaultValue);
  const choisie = value ?? interne;
  const toutes = useMemo(() => [...options, ...fin], [options, fin]);
  const libelleDe = (v: string) => (libre ? v : (toutes.find((o) => o.value === v)?.label ?? ""));
  const [texte, setTexte] = useState(libelleDe(choisie));
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const [filtre, setFiltre] = useState(false);
  const liste = useRef<HTMLUListElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const base = useId();
  const idListe = `${id}-liste`;

  // Une valeur changée de l'extérieur (formulaire contrôlé) : le texte suit.
  useEffect(() => {
    if (value !== undefined && !ouvert) setTexte(libelleDe(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const proposees = useMemo(() => {
    const q = filtre ? plier(texte) : "";
    const trouvees = q ? options.filter((o) => plier(`${o.label} ${o.detail ?? ""}`).includes(q)) : options;
    const avecVide = vide && !libre && !q ? [{ value: "", label: vide }, ...trouvees] : trouvees;
    const exact = options.some((o) => plier(o.label) === plier(texte));
    // Saisie libre : une valeur qui n'existe pas encore est proposée en premier.
    const avecNouveau = libre && texte.trim() && !exact ? [{ value: texte.trim(), label: texte.trim(), detail: nouveau }, ...avecVide] : avecVide;
    return [...avecNouveau, ...fin];
  }, [options, texte, filtre, vide, libre, nouveau, fin]);
  const trouvees = proposees.length - fin.length;

  const choisir = (o: OptionListe) => {
    if (value === undefined) setInterne(o.value);
    onChange?.(o.value);
    setTexte(libre ? o.value : o.value === "" ? "" : o.label);
    setOuvert(false);
    setFiltre(false);
  };

  useEffect(() => {
    if (!ouvert || !liste.current) return;
    const el = liste.current.querySelector<HTMLElement>(`[data-index="${actif}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [actif, ouvert]);

  const fermer = () => {
    setOuvert(false);
    setFiltre(false);
    // Liste fermée : on revient au libellé de la valeur choisie (en saisie libre, le texte est la valeur).
    if (!libre) setTexte(libelleDe(choisie));
  };

  const clavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!ouvert) {
        setOuvert(true);
        setActif(0);
      } else setActif((i) => Math.min(i + 1, proposees.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (ouvert && proposees[actif]) {
        e.preventDefault();
        choisir(proposees[actif]);
      }
    } else if (e.key === "Escape") {
      if (ouvert) {
        e.preventDefault();
        fermer();
      }
    }
  };

  let groupe: string | undefined;
  return (
    <div className={`liste-filtrable${className ? ` ${className}` : ""}`} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && fermer()}>
      <input
        ref={champ}
        id={id}
        name={libre ? name : undefined}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-activedescendant={ouvert && proposees[actif] ? `${base}-${actif}` : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder ?? (vide && !libre ? vide : undefined)}
        required={required && libre}
        disabled={disabled}
        maxLength={maxLength}
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          setFiltre(true);
          setOuvert(true);
          setActif(0);
          if (libre) {
            if (value === undefined) setInterne(e.target.value);
            onChange?.(e.target.value);
          }
        }}
        onFocus={() => {
          setOuvert(true);
          setActif(Math.max(0, proposees.findIndex((o) => o.value === choisie)));
        }}
        onClick={() => setOuvert(true)}
        onKeyDown={clavier}
      />
      {!libre ? <input type="hidden" name={name} value={choisie} /> : null}
      {/* Choix obligatoire : un champ invisible, lui, porte l'obligation (le navigateur le signale). */}
      {!libre && required ? <input tabIndex={-1} aria-hidden="true" className="liste-filtrable__requis" value={choisie} onChange={() => {}} required /> : null}
      <button type="button" className="liste-filtrable__ouvrir" tabIndex={-1} aria-hidden="true" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => (ouvert ? fermer() : (setOuvert(true), champ.current?.focus()))}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {ouvert ? (
        <ul ref={liste} id={idListe} role="listbox" className="liste-filtrable__liste">
          {trouvees === 0 && !libre ? (
            <li className="liste-filtrable__vide" role="presentation">
              {aucun} « {texte.trim()} »
            </li>
          ) : null}
          {proposees.map((o, i) => {
            const entete = o.groupe && o.groupe !== groupe ? o.groupe : null;
            groupe = o.groupe;
            return (
              <li key={`${o.value}-${i}`} role="presentation">
                {entete ? (
                  <span className="liste-filtrable__groupe" role="presentation">
                    {entete}
                  </span>
                ) : null}
                <span
                  id={`${base}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === actif}
                  className={`liste-filtrable__option${o.value === choisie && !(libre && o.detail === nouveau) ? " liste-filtrable__option--choisie" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActif(i)}
                  onClick={() => choisir(o)}
                >
                  <span>{o.label}</span>
                  {o.detail ? <small>{o.detail}</small> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
