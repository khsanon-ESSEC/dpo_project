"use client";

import { useEffect, useId, useRef, useState } from "react";
import { analyserLigne } from "@/lib/barre";
import { jourComplet } from "@/lib/dates";
import { cleNom } from "@/lib/projets";
import type { ProjetSaisie } from "@/lib/saisie-rapide";

export type PersonneLigne = { id: string; nom: string; externe?: boolean; organisation?: string };
export type ValeurLigne = { texte: string; projet: ProjetSaisie | null; personne: PersonneLigne | null; echeance: string | null; heures: number | null };

type Liste = { type: "projet" | "personne"; debut: number; requete: string };
type Ignore = { projet?: boolean; personne?: boolean; echeance?: boolean; heures?: boolean };

/**
 * Une ligne de formulaire qui se remplit comme la barre, sans liste déroulante à ouvrir : on écrit, et
 * - le projet (« / » puis son nom, son code en majuscules « UR », ou « projet retail »),
 * - la personne (« @ » puis son nom, ou « pour Fabienne »),
 * - la date (« vendredi », « 12/11 ») et le temps estimé (« 3h »), si le formulaire en a,
 * sont reconnus et montrés en étiquettes, qu'on peut retirer d'un clic. Le formulaire reçoit des champs cachés :
 * le texte sans les mots reconnus et les identifiants choisis. Le serveur vérifie ces identifiants comme il
 * vérifiait ceux des listes déroulantes (projet visible, personne à qui l'on peut confier une tâche).
 */
export function SaisieLigne({
  id,
  libelle,
  placeholder,
  projets,
  personnes,
  moiId,
  aujourdhui,
  heures = false,
  noms,
  pourDefaut,
  sansProjet = "Sans projet",
  valeurInitiale,
  autoFocus,
  onValeur,
  puces,
}: {
  id: string;
  /** Libellé lu par les lecteurs d'écran (null : le formulaire a déjà un libellé visible pour ce champ). */
  libelle: string | null;
  placeholder: string;
  /** Projets reconnus (« / », code, « projet … ») ; absent : la ligne ne porte pas de projet. */
  projets?: ProjetSaisie[];
  /** Personnes reconnues (« @ », « pour … ») ; absent : la ligne n'est confiée à personne. */
  personnes?: PersonneLigne[];
  moiId?: string;
  /** Présent : la date est reconnue (« vendredi », « 12/11 »). */
  aujourdhui?: string;
  /** Le temps estimé est reconnu (« 3h »). */
  heures?: boolean;
  /** Noms des champs cachés envoyés au serveur. */
  noms: { texte: string; projet?: string; personne?: string; echeance?: string; heures?: string };
  /** Personne retenue quand la ligne n'en nomme aucune (« Moi »). */
  pourDefaut?: PersonneLigne;
  /** Étiquette quand aucun projet n'est reconnu (null : aucune, le formulaire montre déjà le projet). */
  sansProjet?: string | null;
  valeurInitiale?: { texte?: string; projet?: ProjetSaisie | null; personne?: PersonneLigne | null; echeance?: string | null };
  autoFocus?: boolean;
  onValeur?: (v: ValeurLigne) => void;
  /** Étiquettes propres au formulaire (ce que la ligne change), affichées après celles de la ligne. */
  puces?: (v: ValeurLigne) => React.ReactNode;
}) {
  const [texte, setTexte] = useState(valeurInitiale?.texte ?? "");
  const [projetChoisi, setProjetChoisi] = useState<ProjetSaisie | null>(valeurInitiale?.projet ?? null);
  const [personneChoisie, setPersonneChoisie] = useState<PersonneLigne | null>(valeurInitiale?.personne ?? null);
  const [echeanceChoisie, setEcheanceChoisie] = useState<string | null>(valeurInitiale?.echeance ?? null);
  const [ignore, setIgnore] = useState<Ignore>({});
  const [liste, setListe] = useState<Liste | null>(null);
  const [surligne, setSurligne] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const idListe = useId();

  // Ce qui est choisi à la main l'emporte : les mots de ce genre restent alors du texte.
  const a = analyserLigne(texte, {
    projets: projets && !projetChoisi && !ignore.projet ? projets : [],
    personnes: personnes && !personneChoisie && !ignore.personne ? personnes : [],
    moiId,
    aujourdhui: aujourdhui && !echeanceChoisie && !ignore.echeance ? aujourdhui : undefined,
    heures: heures && !ignore.heures,
  });
  const projet = projetChoisi ?? a.projet;
  const personne = personneChoisie ?? a.personne;
  const echeance = echeanceChoisie ?? a.echeance;
  const net = a.texte;
  const valeur: ValeurLigne = { texte: net, projet, personne, echeance, heures: a.heures };

  const cle = `${net}|${projet?.id ?? ""}|${personne?.id ?? ""}|${echeance ?? ""}|${a.heures ?? ""}`;
  useEffect(() => {
    onValeur?.(valeur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const choix =
    liste?.type === "projet"
      ? (projets ?? [])
          .filter((p) => !liste.requete || cleNom(`${p.code} ${p.titre}`).includes(cleNom(liste.requete)))
          .slice(0, 8)
          .map((p) => ({ id: p.id, libelle: p.titre, code: p.code as string | null, sous: undefined as string | undefined }))
      : liste?.type === "personne"
        ? (personnes ?? [])
            .filter((p) => !liste.requete || cleNom(`${p.nom} ${p.organisation ?? ""}`).includes(cleNom(liste.requete)))
            .slice(0, 8)
            .map((p) => ({ id: p.id, libelle: p.id === moiId ? "Moi" : p.nom, code: null, sous: p.externe ? ["Hors division", p.organisation].filter(Boolean).join(" · ") : undefined }))
        : [];

  /** « / » ou « @ » juste avant le curseur (au début ou après une espace). */
  const reperer = (valeur: string, curseur: number) => {
    const m = /(^|\s)([/@])([^/@]{0,40})$/.exec(valeur.slice(0, curseur));
    if (!m || (m[2] === "/" && !projets) || (m[2] === "@" && !personnes)) return setListe(null);
    setListe({ type: m[2] === "/" ? "projet" : "personne", debut: curseur - m[3].length - 1, requete: m[3] });
    setSurligne(0);
  };

  const choisir = (c: { id: string }) => {
    if (!liste) return;
    const curseur = champ.current?.selectionStart ?? texte.length;
    const nouveau = `${texte.slice(0, liste.debut)}${texte.slice(curseur)}`.replace(/\s{2,}/g, " ");
    if (liste.type === "projet") setProjetChoisi(projets?.find((p) => p.id === c.id) ?? null);
    else setPersonneChoisie(personnes?.find((p) => p.id === c.id) ?? null);
    setTexte(nouveau);
    setListe(null);
    const position = liste.debut;
    requestAnimationFrame(() => {
      champ.current?.focus();
      champ.current?.setSelectionRange(position, position);
    });
  };

  const clavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (liste && e.key === "Escape") {
      e.preventDefault();
      setListe(null);
      return;
    }
    if (liste && choix.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setSurligne((s) => (e.key === "ArrowDown" ? (s + 1) % choix.length : (s - 1 + choix.length) % choix.length));
      return;
    }
    if (liste && choix.length && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      choisir(choix[Math.min(surligne, choix.length - 1)]);
      return;
    }
    if (liste && e.key === "Enter") {
      // « / » sans projet qui corresponde : on n'envoie pas la ligne avec « /xyz » dedans.
      e.preventDefault();
      return;
    }
    // Retour arrière dans une ligne vide : la dernière étiquette choisie s'en va.
    if (e.key === "Backspace" && !texte && (personneChoisie || projetChoisi || echeanceChoisie)) {
      e.preventDefault();
      if (echeanceChoisie) setEcheanceChoisie(null);
      else if (personneChoisie) setPersonneChoisie(null);
      else setProjetChoisi(null);
    }
  };

  const puce = (t: string, retirer: (() => void) | null, classe: string) => (
    <span className={`saisie-rapide__morceau ${classe}`}>
      {t}
      {retirer ? (
        <button type="button" className="puce__retirer" onClick={retirer} aria-label={`Retirer ${t}`}>
          ×
        </button>
      ) : null}
    </span>
  );
  const nomDe = (p: PersonneLigne) => (p.id === moiId ? "moi" : p.nom);

  return (
    <div className="ligne-saisie">
      <div className="commande">
        {libelle ? (
          <label className="visuellement-cache" htmlFor={id}>
            {libelle}
          </label>
        ) : null}
        <input
          ref={champ}
          id={id}
          value={texte}
          autoFocus={autoFocus}
          onChange={(e) => {
            const v = e.target.value.slice(0, 500);
            setTexte(v);
            if (!v.trim()) setIgnore({});
            reperer(v, e.target.selectionStart ?? v.length);
          }}
          onKeyDown={clavier}
          onBlur={() => setListe(null)}
          placeholder={placeholder}
          maxLength={500}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={!!liste && choix.length > 0}
          aria-controls={`${idListe}-liste`}
          aria-activedescendant={liste && choix.length ? `${idListe}-o${Math.min(surligne, choix.length - 1)}` : undefined}
        />
        {liste && choix.length ? (
          <ul id={`${idListe}-liste`} role="listbox" className="commande__liste" aria-label={liste.type === "projet" ? "Projets" : "Personnes"}>
            {choix.map((c, i) => (
              <li
                key={c.id}
                id={`${idListe}-o${i}`}
                role="option"
                aria-selected={i === Math.min(surligne, choix.length - 1)}
                className="commande__option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choisir(c);
                }}
              >
                {c.code ? <span className="mono">{c.code}</span> : null}
                <span className="commande__texte">
                  <span className="commande__libelle">{c.libelle}</span>
                  {c.sous ? <span className="commande__sous">{c.sous}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : liste ? (
          <p className="commande__vide" role="status">
            {liste.type === "projet" ? "Aucun projet ne correspond." : "Personne ne correspond."}
          </p>
        ) : null}
      </div>
      <p className="ligne-saisie__puces" aria-live="polite">
        {projets
          ? projet
            ? puce(`${projet.code} · ${projet.titre}`, () => (projetChoisi ? setProjetChoisi(null) : setIgnore({ ...ignore, projet: true })), "saisie-rapide__morceau--projet")
            : sansProjet
              ? puce(texte.trim() ? `${sansProjet} · « / » pour choisir` : sansProjet, null, "saisie-rapide__morceau--discret")
              : null
          : null}
        {personnes
          ? personne
            ? puce(`Pour ${nomDe(personne)}`, () => (personneChoisie ? setPersonneChoisie(null) : setIgnore({ ...ignore, personne: true })), "saisie-rapide__morceau--personne")
            : pourDefaut
              ? puce(`Pour ${nomDe(pourDefaut)}`, null, "saisie-rapide__morceau--discret")
              : null
          : null}
        {aujourdhui && echeance ? puce(jourComplet(echeance), () => (echeanceChoisie ? setEcheanceChoisie(null) : setIgnore({ ...ignore, echeance: true })), "saisie-rapide__morceau--echeance") : null}
        {heures && a.heures ? puce(`${a.heures} h de travail`, () => setIgnore({ ...ignore, heures: true }), "saisie-rapide__morceau--heures") : null}
        {puces?.(valeur)}
      </p>
      <input type="hidden" name={noms.texte} value={net} />
      {noms.projet ? <input type="hidden" name={noms.projet} value={projet?.id ?? ""} /> : null}
      {noms.personne ? <input type="hidden" name={noms.personne} value={personne?.id ?? pourDefaut?.id ?? ""} /> : null}
      {noms.echeance ? <input type="hidden" name={noms.echeance} value={echeance ?? ""} /> : null}
      {noms.heures ? <input type="hidden" name={noms.heures} value={a.heures ?? ""} /> : null}
    </div>
  );
}
