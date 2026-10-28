"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { ajouterTacheRapide, type EtatSaisieRapide } from "@/app/(app)/taches/actions";
import { analyserSaisie, type ProjetSaisie } from "@/lib/saisie-rapide";
import { cleNom } from "@/lib/projets";
import { Icone } from "@/components/Icone";

export type PersonneBarre = { id: string; nom: string; externe?: boolean; organisation?: string };

type Choix = { id: string; libelle: string; sous?: string };
type Liste = { type: "projet" | "personne" | "tache"; debut: number; requete: string };
export type TacheBarre = { id: string; titre: string; code: string | null; echeance: string | null };
type Resultats = {
  projets: { liste: { id: string; code: string; texte: string; sous: string }[]; total: number };
  taches: { liste: { id: string; texte: string; code: string | null; sous: string }[]; total: number };
  personnes: { liste: { id: string; texte: string; sous: string }[]; total: number };
} | null;
type Ligne = { cle: string; libelle: string; sous?: string; code?: string | null; action: () => void };

/**
 * Une seule barre pour chercher et pour ajouter une tâche, comme dans Notion :
 * - « / » ouvre la liste des projets, « @ » celle des personnes à qui l'on peut confier la tâche,
 *   « # » celle de mes tâches ouvertes (choisir une tâche l'ouvre, pour la mettre à jour) ;
 * - une date (demain, vendredi, 12/11) et des heures (2h) écrites dans le texte sont reconnues ;
 * - mode « tâche » (À faire, Ma semaine) : Entrée ajoute la tâche ;
 * - mode « recherche » : Entrée cherche, la première ligne propose d'ajouter la tâche ; dès qu'un projet
 *   ou une personne est choisi, Entrée ajoute la tâche.
 */
export function BarreCommande({
  mode,
  projets,
  personnes,
  base,
  parProjet,
  taches,
  moiId,
  aujourdhui,
  retour,
  initial = "",
  focus = mode === "recherche",
}: {
  mode: "tache" | "recherche";
  projets: ProjetSaisie[];
  personnes: PersonneBarre[];
  base: string[];
  parProjet: Record<string, string[]>;
  taches: TacheBarre[];
  moiId: string;
  aujourdhui: string;
  retour: string;
  initial?: string;
  /** Curseur dans la barre à l'ouverture de la page (pas sur le menu du téléphone : le clavier s'ouvrirait). */
  focus?: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatSaisieRapide, FormData>(ajouterTacheRapide, { message: null, n: 0 });
  const [texte, setTexte] = useState(initial);
  const [projet, setProjet] = useState<ProjetSaisie | null>(null);
  const [personne, setPersonne] = useState<PersonneBarre | null>(null);
  const [liste, setListe] = useState<Liste | null>(null);
  const [surligne, setSurligne] = useState(-1);
  const [resultats, setResultats] = useState<Resultats>(null);
  const [vu, setVu] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  const idListe = useId();

  // Après un ajout réussi : tout se vide.
  if (etat.ok && etat.n !== vu) {
    setVu(etat.n ?? 0);
    setTexte("");
    setProjet(null);
    setPersonne(null);
    setListe(null);
    setResultats(null);
  }

  const analyse = texte.trim() ? analyserSaisie(texte, aujourdhui, projets) : null;
  const projetEffectif = projet ?? analyse?.projet ?? null;

  // Personnes qu'on peut choisir : soi, celles qu'on suit, l'équipe des projets qu'on dirige ; hors division
  // seulement sur un projet qu'on dirige (mêmes règles que le formulaire complet).
  const permis = new Set([...base, ...(projetEffectif ? (parProjet[projetEffectif.id] ?? []) : [])]);
  const externesPermis = !!projetEffectif && projetEffectif.id in parProjet;
  const personnesPermises = personnes.filter((p) => (p.externe ? externesPermis : permis.has(p.id)));
  // Une personne choisie qui n'est plus permise (projet changé) est retirée.
  useEffect(() => {
    if (personne && !personnesPermises.some((p) => p.id === personne.id)) setPersonne(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetEffectif?.id]);

  // Choix proposés par « / » ou « @ ».
  const choix: Choix[] = !liste
    ? []
    : liste.type === "tache"
      ? taches
          .filter((t) => !liste.requete || cleNom(`${t.code ?? ""} ${t.titre}`).includes(cleNom(liste.requete)))
          .slice(0, 8)
          .map((t) => ({ id: t.id, libelle: t.titre, sous: t.code ?? undefined }))
      : liste.type === "projet"
      ? projets
          .filter((p) => !liste.requete || cleNom(`${p.code} ${p.titre}`).includes(cleNom(liste.requete)))
          .slice(0, 8)
          .map((p) => ({ id: p.id, libelle: p.titre, sous: p.code }))
      : personnesPermises
          .filter((p) => !liste.requete || cleNom(`${p.nom} ${p.organisation ?? ""}`).includes(cleNom(liste.requete)))
          .slice(0, 8)
          .map((p) => ({ id: p.id, libelle: p.id === moiId ? "Moi" : p.nom, sous: p.externe ? ["Hors division", p.organisation].filter(Boolean).join(" · ") : undefined }));

  // Résultats de recherche en direct (mode recherche, sans liste ouverte).
  useEffect(() => {
    if (mode !== "recherche" || liste || cleNom(texte).length < 2) {
      setResultats(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/recherche?q=${encodeURIComponent(texte)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setResultats(j))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [texte, mode, liste]);

  /** Repère « /… » ou « @… » juste avant le curseur (au début ou après une espace). */
  const reperer = (valeur: string, curseur: number) => {
    const avant = valeur.slice(0, curseur);
    const m = /(^|\s)([/@#])([^/@#]{0,40})$/.exec(avant);
    if (!m) return setListe(null);
    const requete = m[3];
    const type = m[2] === "/" ? "projet" : m[2] === "#" ? "tache" : "personne";
    setListe({ type, debut: avant.length - requete.length - 1, requete });
    setSurligne(0);
  };

  const choisir = (c: Choix) => {
    if (!liste) return;
    // « # » : la tâche choisie s'ouvre.
    if (liste.type === "tache") {
      window.location.href = `/taches/${c.id}?retour=${encodeURIComponent(retour)}`;
      return;
    }
    const curseur = champ.current?.selectionStart ?? texte.length;
    const nouveau = `${texte.slice(0, liste.debut)}${texte.slice(curseur)}`.replace(/\s{2,}/g, " ");
    if (liste.type === "projet") setProjet(projets.find((p) => p.id === c.id) ?? null);
    else setPersonne(personnes.find((p) => p.id === c.id) ?? null);
    setTexte(nouveau);
    setListe(null);
    requestAnimationFrame(() => {
      champ.current?.focus();
      champ.current?.setSelectionRange(liste.debut, liste.debut);
    });
  };

  const ajouter = () => {
    if (analyse?.titre) formulaire.current?.requestSubmit();
  };
  const chercher = () => {
    if (texte.trim()) window.location.href = `/recherche?q=${encodeURIComponent(texte.trim())}`;
  };

  // Lignes de la liste déroulante du mode recherche.
  const lignes: Ligne[] =
    mode === "recherche" && !liste && texte.trim()
      ? [
          ...(analyse?.titre ? [{ cle: "ajouter", libelle: `Ajouter la tâche « ${analyse.titre} »`, sous: "pour vous ; / pour un projet, @ pour une personne", code: "+", action: ajouter }] : []),
          ...(resultats?.projets.liste ?? []).map((p) => ({ cle: `p-${p.id}`, libelle: p.texte, sous: p.sous || "Projet", code: p.code, action: () => (window.location.href = `/projets/${p.id}`) })),
          ...(resultats?.taches.liste ?? []).map((t) => ({ cle: `t-${t.id}`, libelle: t.texte, sous: t.sous || "Tâche", code: t.code, action: () => (window.location.href = `/taches/${t.id}`) })),
          ...(resultats?.personnes.liste ?? []).map((p) => ({ cle: `n-${p.id}`, libelle: p.texte, sous: p.sous || "Personne", code: null, action: () => (window.location.href = `/personnes/${p.id}`) })),
          { cle: "tout", libelle: `Tous les résultats pour « ${texte.trim()} »`, sous: undefined, code: null, action: chercher },
        ]
      : [];
  const nb = liste ? choix.length : lignes.length;
  const ouvert = nb > 0 && (!!liste || mode === "recherche");

  const clavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (liste) setListe(null);
      else setSurligne(-1);
      return;
    }
    if (ouvert && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setSurligne((i) => (e.key === "ArrowDown" ? (i + 1) % nb : (i - 1 + nb) % nb));
      return;
    }
    if (liste && (e.key === "Enter" || e.key === "Tab") && choix.length) {
      e.preventDefault();
      choisir(choix[Math.max(0, surligne)]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "recherche" && surligne >= 0 && lignes[surligne]) return lignes[surligne].action();
      if (mode === "tache" || projet || personne) return ajouter();
      return chercher();
    }
  };

  const puce = (texte: string, retirer: (() => void) | null, classe = "") => (
    <span className={`saisie-rapide__morceau ${classe}`}>
      {texte}
      {retirer ? (
        <button type="button" className="puce__retirer" onClick={retirer} aria-label={`Retirer ${texte}`}>
          ×
        </button>
      ) : null}
    </span>
  );

  return (
    <form ref={formulaire} action={action} className="saisie-rapide" role={mode === "recherche" ? "search" : undefined} onSubmit={(e) => !analyse?.titre && e.preventDefault()}>
      <label htmlFor={`${idListe}-champ`} className="visuellement-cache">
        {mode === "recherche" ? "Rechercher, ou ajouter une tâche" : "Ajouter une tâche"}
      </label>
      <div className="commande">
        <div className="saisie-rapide__ligne">
          <Icone nom={mode === "recherche" ? "loupe" : "ajouter"} taille={18} />
          <input
            ref={champ}
            id={`${idListe}-champ`}
            name="saisie"
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              setSurligne(-1);
              reperer(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={clavier}
            onBlur={() => setTimeout(() => setListe(null), 150)}
            maxLength={300}
            autoComplete="off"
            autoFocus={focus}
            enterKeyHint={mode === "recherche" ? "search" : "done"}
            placeholder={mode === "recherche" ? "Chercher, ou écrire une tâche ( / projet · @ personne · # mes tâches )" : "Ajouter une tâche ( / projet · @ personne · # mes tâches )"}
            role="combobox"
            aria-expanded={ouvert}
            aria-controls={`${idListe}-liste`}
            aria-autocomplete="list"
            aria-activedescendant={ouvert && surligne >= 0 ? `${idListe}-o${surligne}` : undefined}
          />
          <button
            type="button"
            className="bouton-ambre"
            disabled={enCours || (mode === "tache" ? !analyse?.titre : !texte.trim())}
            onClick={() => (mode === "tache" || projet || personne ? ajouter() : chercher())}
          >
            {enCours ? "…" : mode === "tache" || projet || personne ? "Ajouter" : "Chercher"}
          </button>
        </div>
        {ouvert ? (
          <ul id={`${idListe}-liste`} role="listbox" className="commande__liste" aria-label={liste ? (liste.type === "projet" ? "Projets" : liste.type === "tache" ? "Mes tâches" : "Personnes") : "Résultats"}>
            {liste
              ? choix.map((c, i) => (
                  <li
                    key={c.id}
                    id={`${idListe}-o${i}`}
                    role="option"
                    aria-selected={i === surligne}
                    className="commande__option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choisir(c);
                    }}
                  >
                    {liste.type === "projet" || (liste.type === "tache" && c.sous) ? <span className="mono">{c.sous}</span> : null}
                    <span className="commande__texte">
                      <span className="commande__libelle">{c.libelle}</span>
                      {liste.type === "personne" && c.sous ? <span className="commande__sous">{c.sous}</span> : null}
                    </span>
                  </li>
                ))
              : lignes.map((l, i) => (
                  <li
                    key={l.cle}
                    id={`${idListe}-o${i}`}
                    role="option"
                    aria-selected={i === surligne}
                    className={`commande__option${l.cle === "ajouter" ? " commande__option--ajouter" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      l.action();
                    }}
                  >
                    {l.code ? <span className="mono">{l.code}</span> : null}
                    <span className="commande__texte">
                      <span className="commande__libelle">{l.libelle}</span>
                      {l.sous ? <span className="commande__sous">{l.sous}</span> : null}
                    </span>
                  </li>
                ))}
          </ul>
        ) : null}
        {liste && !choix.length ? (
          <p className="commande__vide" role="status">
            {liste.type === "projet" ? "Aucun projet ne correspond." : liste.type === "tache" ? "Aucune de vos tâches ouvertes ne correspond." : "Personne ne correspond parmi celles à qui vous pouvez confier une tâche."}
          </p>
        ) : null}
      </div>
      <p className="saisie-rapide__apercu" aria-live="polite">
        {analyse && (mode === "tache" || projet || personne) ? (
          <>
            <span className="saisie-rapide__titre">{analyse.titre || "Écrivez ce qu'il y a à faire"}</span>
            {projet
              ? puce(`${projet.code} · ${projet.titre}`, () => setProjet(null), "saisie-rapide__morceau--projet")
              : analyse.projet
                ? puce(`${analyse.projet.code} · ${analyse.projet.titre}`, null, "saisie-rapide__morceau--projet")
                : puce("Hors projet", null, "saisie-rapide__morceau--discret")}
            {personne ? puce(`Pour ${personne.id === moiId ? "moi" : personne.nom}`, () => setPersonne(null), "saisie-rapide__morceau--personne") : null}
            {analyse.morceaux.filter((m) => m.type !== "projet").map((m) => (
              <span key={m.type} className={`saisie-rapide__morceau saisie-rapide__morceau--${m.type}`}>
                {m.texte}
              </span>
            ))}
          </>
        ) : etat.message ? (
          <span className={etat.ok ? "ton-ok" : "ton-retard"} role={etat.ok ? undefined : "alert"}>
            {etat.message}{" "}
            {etat.ok && etat.id ? (
              <a href={`/taches/${etat.id}`} className="lien-discret">
                Préciser
              </a>
            ) : null}
          </span>
        ) : mode === "tache" ? (
          <span className="ton-discret">
            <kbd>/</kbd> un projet · <kbd>@</kbd> une personne · <kbd>#</kbd> une de mes tâches ; une date (demain, vendredi, 12/11) et des heures (2h) sont reconnues.{" "}
            <a href={`/taches/nouvelle?retour=${encodeURIComponent(retour)}`} className="lien-discret">
              Formulaire complet
            </a>
          </span>
        ) : null}
      </p>
      <input type="hidden" name="projetId" value={projet?.id ?? ""} />
      <input type="hidden" name="assigneId" value={personne?.id ?? ""} />
    </form>
  );
}
