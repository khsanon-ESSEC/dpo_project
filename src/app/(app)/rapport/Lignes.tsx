"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  ajouterLigne,
  basculerPartieRelue,
  basculerRemonte,
  changerProjetLigne,
  annulerResolu,
  commenter,
  marquerResolu,
  modifierLigne,
  remettreLigne,
  repondre,
  supprimerLigne,
} from "./actions";
import { CocheSeule } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";
import { SaisieLigne } from "@/components/SaisieLigne";
import { CodeProjet } from "@/components/Liens";
import { semainesDepuis } from "@/lib/lecture-rapport";

type Ligne = {
  id: string;
  texte: string;
  projetId: string | null;
  projetCode: string | null;
  projetTitre: string | null;
  partie?: string | null;
  depuisSemaine?: string | null;
  resolu?: boolean;
};
type Projet = { id: string; code: string; titre: string };

/** Le texte d'une ligne s'affiche en entier : le champ prend la hauteur de son contenu. */
const ajuster = (t: HTMLTextAreaElement | null) => {
  if (!t) return;
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight}px`;
};

/**
 * Le projet d'une ligne : son code, qui se change d'un clic (une petite liste à filtrer), sans liste déroulante.
 * « Sans projet » : seul le supérieur voit la ligne.
 */
function ChoixCode({ ligne, projets }: { ligne: Ligne; projets: Projet[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [, demarrer] = useTransition();
  const [code, setCode] = useOptimistic(ligne.projetCode);
  const plat = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Le code tapé en entier passe devant (« PR ») ; puis les codes qui commencent ainsi ; puis les titres.
  const f = plat(filtre.trim());
  const rang = (p: Projet) => (!f ? 0 : plat(p.code) === f ? 0 : plat(p.code).startsWith(f) ? 1 : plat(p.titre).includes(f) ? 2 : 9);
  const liste = [
    ...(!f || "sans projet".startsWith(f) ? [{ id: "", code: "—", titre: "Sans projet" }] : []),
    ...projets
      .filter((p) => rang(p) < 9)
      .sort((a, b) => rang(a) - rang(b)),
  ]
    .sort((a, b) => (f ? (a.id ? rang(a) : 3) - (b.id ? rang(b) : 3) : 0))
    .slice(0, 8);
  const choisir = (p: { id: string; code: string }) => {
    setOuvert(false);
    setFiltre("");
    demarrer(async () => {
      setCode(p.id ? p.code : null);
      await changerProjetLigne(ligne.id, p.id || null);
    });
  };
  return (
    <span className="choix-code">
      <button
        type="button"
        className="etiquette-projet choix-code__bouton"
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        title={ligne.projetTitre ? `${ligne.projetTitre} : changer de projet` : "Sans projet : seul votre supérieur voit cette ligne. Choisir un projet"}
        aria-label={`Projet de la ligne « ${ligne.texte} » : ${ligne.projetTitre ?? "sans projet"}. Changer`}
        onClick={() => setOuvert(!ouvert)}
      >
        {code ?? "—"}
      </button>
      {ouvert ? (
        <span className="choix-code__liste" role="dialog" aria-label="Choisir le projet">
          <input
            autoFocus
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOuvert(false);
              if (e.key === "Enter" && liste[0]) {
                e.preventDefault();
                choisir(liste[0]);
              }
            }}
            onBlur={() => setTimeout(() => setOuvert(false), 150)}
            placeholder="Projet…"
            aria-label="Filtrer les projets"
          />
          <span role="listbox" aria-label="Projets">
            {liste.map((p) => (
              <span
                key={p.id || "aucun"}
                role="option"
                aria-selected={(p.id || null) === ligne.projetId}
                className="choix-code__option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choisir(p);
                }}
              >
                <span className="mono">{p.code}</span>
                {p.titre}
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** Une ligne du rapport : texte modifiable, projet, retrait. Les éléments reçus gardent le nom de leurs auteurs. */
export function LigneEditable({
  ligne,
  projets,
  modifiable,
  parProjet = true,
  auteurs,
  projetVisible = false,
  semaine,
}: {
  ligne: Ligne;
  projets: Projet[];
  modifiable: boolean;
  parProjet?: boolean;
  /** Élément reçu de l'équipe : initiales de ses auteurs (il se retire, il ne se supprime pas). */
  auteurs?: { id?: string; initiales: string; nom: string }[];
  /** Le lecteur voit ce projet : son code mène à la fiche. */
  projetVisible?: boolean;
  /** Lundi de la semaine du rapport (ancienneté d'un blocage). */
  semaine?: string;
}) {
  const [texte, setTexte] = useState(ligne.texte);
  const [enCours, demarrer] = useTransition();
  const recu = !!auteurs;
  const n = semainesDepuis(ligne.depuisSemaine, semaine);
  // L'ancienneté ne se montre que pour ce qui revient de semaine en semaine : blocages et décisions attendues.
  const ancien = n > 1 && !ligne.resolu && (ligne.partie === "bloque" || ligne.partie === "decision") ? (
    <span className="age-ligne age-ligne--ancien" title={`Signalé pour la première fois la semaine du ${ligne.depuisSemaine!.split("-").reverse().slice(0, 2).join("/")}`}>
      {n}ᵉ semaine
    </span>
  ) : null;
  const Auteurs = recu ? (
    <span style={{ display: "inline-flex", gap: 3, flex: "none" }}>
      {auteurs!.map((a) =>
        a.id ? (
          <a key={a.initiales} href={`/personnes/${a.id}`} className="initiales" title={a.nom} aria-label={a.nom}>
            {a.initiales}
          </a>
        ) : (
          <span key={a.initiales} className="initiales" title={a.nom}>
            {a.initiales}
          </span>
        ),
      )}
    </span>
  ) : null;
  if (!modifiable) {
    return (
      <li style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "6px 0", borderTop: 0, fontSize: 15, lineHeight: "22px" }}>
        {parProjet ? <CodeProjet id={ligne.projetId} code={ligne.projetCode ?? "—"} titre={ligne.projetTitre ?? "Sans projet"} visible={projetVisible} /> : null}
        <span style={{ flex: 1, minWidth: 0 }}>{ligne.texte}</span>
        {ancien}
        {ligne.resolu ? <span className="age-ligne age-ligne--resolu">Résolu</span> : null}
        {Auteurs}
      </li>
    );
  }
  const resoluble = !recu && (ligne.partie === "bloque" || ligne.partie === "decision");
  return (
    <li className={`ligne-rapport${ligne.resolu ? " ligne-rapport--resolue" : ""}`}>
      {parProjet && !recu ? <ChoixCode ligne={ligne} projets={projets} /> : parProjet ? <CodeProjet id={ligne.projetId} code={ligne.projetCode ?? "—"} titre={ligne.projetTitre ?? "Sans projet"} visible={projetVisible} /> : null}
      <label className="visuellement-cache" htmlFor={`texte-${ligne.id}`}>
        Texte de la ligne
      </label>
      <textarea
        id={`texte-${ligne.id}`}
        ref={ajuster}
        rows={1}
        className="ligne-rapport__texte"
        value={texte}
        maxLength={500}
        onChange={(e) => {
          setTexte(e.target.value.replace(/\n/g, " "));
          ajuster(e.currentTarget);
        }}
        onKeyDown={(e) => {
          // Une ligne reste une ligne : Entrée enregistre.
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (texte.trim() !== ligne.texte) demarrer(() => modifierLigne(ligne.id, texte));
        }}
      />
      {ancien}
      {Auteurs}
      {resoluble && ligne.resolu ? (
        <button
          type="button"
          className="bouton-mini bouton-mini--resolu"
          aria-pressed="true"
          disabled={enCours}
          onClick={() => demarrer(() => annulerResolu(ligne.id))}
          title="Résolu cette semaine : ne reviendra pas la semaine prochaine. Cliquer pour annuler"
        >
          <Icone nom="coche" taille={14} /> Résolu
        </button>
      ) : resoluble ? (
        <button
          type="button"
          className="bouton-mini"
          aria-pressed="false"
          disabled={enCours}
          onClick={() => demarrer(() => marquerResolu(ligne.id))}
          title="Résolu : reste dans ce rapport, marqué « Résolu », et ne reviendra pas la semaine prochaine"
        >
          <Icone nom="coche" taille={14} /> Résolu
        </button>
      ) : null}
      <button
        type="button"
        className="bouton-icone ligne-rapport__retirer"
        aria-label={recu ? `Retirer de mon rapport : « ${ligne.texte} »` : `Supprimer « ${ligne.texte} »`}
        title={recu ? "Retirer de mon rapport" : "Supprimer"}
        onClick={() => demarrer(() => supprimerLigne(ligne.id))}
      >
        <Icone nom="fermer" taille={16} />
      </button>
    </li>
  );
}

/**
 * Ajouter une ligne au rapport en une seule saisie, comme dans la barre : « Recette validée UR »,
 * « Recette validée projet retail » ou « / » pour choisir le projet. Sans projet reconnu, la ligne reste sans projet.
 */
export function AjoutLigne({
  rapportId,
  champId,
  libelle,
  projets,
  parProjet,
  replie = false,
}: {
  rapportId: string;
  champId: string;
  libelle: string;
  projets: Projet[];
  parProjet: boolean;
  /** Des lignes sont déjà là : « + Ajouter » ouvre la ligne de saisie. */
  replie?: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [n, setN] = useState(0);
  const [pret, setPret] = useState(false);
  const [ouvert, setOuvert] = useState(!replie);
  if (!ouvert) {
    return (
      <button type="button" className="lien-ajout" onClick={() => setOuvert(true)} aria-label={`Ajouter une ligne à « ${libelle} »`}>
        <Icone nom="ajouter" taille={14} /> Ajouter
      </button>
    );
  }
  return (
    <form
      className="ajout-ligne"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pret || enCours) return;
        const f = new FormData(e.currentTarget);
        demarrer(async () => {
          await ajouterLigne(rapportId, champId, f);
          setN((x) => x + 1);
          setPret(false);
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && replie && !pret) setOuvert(false);
      }}
    >
      <SaisieLigne
        key={n}
        id={`ajout-${champId}`}
        libelle={`Ajouter une ligne à « ${libelle} »`}
        placeholder={parProjet ? "Ajouter une ligne : « Recette validée UR », « / » pour le projet" : "Ajouter une ligne"}
        projets={parProjet ? projets : undefined}
        noms={{ texte: "texte", projet: parProjet ? "projetId" : undefined }}
        autoFocus={n > 0 || replie}
        onValeur={(v) => setPret(!!v.texte.trim())}
      />
      <button type="submit" className="bouton-contour" disabled={!pret || enCours}>
        <Icone nom="ajouter" taille={16} /> Ajouter
      </button>
    </form>
  );
}

export function BoutonRemettre({ ligneId, texte }: { ligneId: string; texte: string }) {
  const [enCours, demarrer] = useTransition();
  return (
    <button type="button" className="bouton-mini" disabled={enCours} aria-label={`Remettre « ${texte} »`} onClick={() => demarrer(() => remettreLigne(ligneId))}>
      <Icone nom="reprendre" taille={14} /> Remettre
    </button>
  );
}

/** Rapport de chef : « Remonter » met un élément à décider en tête du rapport de son supérieur. */
export function InterrupteurRemonter({ ligneId, remonte, superieur }: { ligneId: string; remonte: boolean; superieur: string | null }) {
  const [enCours, demarrer] = useTransition();
  const [coche, setCoche] = useOptimistic(remonte);
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, flex: "none", fontSize: 12, color: "var(--discret)", cursor: "pointer" }}>
      {superieur ? `Remonter à ${superieur}` : "Remonter"}
      <input
        type="checkbox"
        className="interrupteur"
        checked={coche}
        disabled={enCours}
        onChange={() =>
          demarrer(async () => {
            setCoche(!coche);
            await basculerRemonte(ligneId);
          })
        }
      />
    </label>
  );
}

/** « Relu » : un petit témoin dans l'en-tête de chaque partie (la progression est dans la colonne de droite). */
export function CasePartie({ rapportId, champId, relue, libelle }: { rapportId: string; champId: string; relue: boolean; libelle: string }) {
  const [enCours, demarrer] = useTransition();
  const [coche, setCoche] = useOptimistic(relue);
  return (
    <button
      type="button"
      className="temoin-relu"
      aria-pressed={coche}
      aria-label={`« ${libelle} » relu`}
      title={coche ? "Relu : cliquer pour remettre « à relire »" : "Marquer comme relu"}
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          setCoche(!coche);
          await basculerPartieRelue(rapportId, champId);
        })
      }
    >
      <span className="temoin-relu__rond" aria-hidden="true">
        {coche ? <CocheSeule /> : null}
      </span>
      {coche ? "Relu" : "À relire"}
    </button>
  );
}

/** Un lien qui ouvre un bloc repliable (« Qui lit quoi ? ») et y mène. */
export function LienOuvrir({ cible, children }: { cible: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${cible}`}
      onClick={() => {
        const d = document.getElementById(cible);
        if (d instanceof HTMLDetailsElement) d.open = true;
      }}
    >
      {children}
    </a>
  );
}

type Choix = { valeur: string; libelle: string; propose?: boolean; ton?: "retard" };

/** Choix segmenté : de vrais boutons radio, enregistrés dès qu'on choisit. */
export function ChoixSegmente({
  rapportId,
  champId,
  projetId = null,
  nom,
  choix,
  valeur,
  libelle,
  pleine,
  modifiable = true,
}: {
  rapportId: string;
  champId: string;
  projetId?: string | null;
  nom: string;
  choix: Choix[];
  valeur: string;
  libelle: string;
  pleine?: boolean;
  modifiable?: boolean;
}) {
  const [, demarrer] = useTransition();
  const [courant, setCourant] = useOptimistic(valeur);
  return (
    <span role="radiogroup" aria-label={libelle} className={`segmente${pleine ? " segmente--pleine" : ""}`}>
      {choix.map((c) => (
        <label key={c.valeur} className={`segmente__choix${c.ton === "retard" ? " segmente__choix--retard" : ""}`}>
          <input
            type="radio"
            name={nom}
            value={c.valeur}
            checked={courant === c.valeur}
            disabled={!modifiable}
            onChange={() =>
              demarrer(async () => {
                setCourant(c.valeur);
                await repondre(rapportId, champId, projetId, c.valeur);
              })
            }
          />
          {c.libelle}
          {c.propose ? <span className="segmente__propose">proposé</span> : null}
        </label>
      ))}
    </span>
  );
}

/** Texte libre, enregistré en quittant le champ. */
export function TexteReponse({
  rapportId,
  champId,
  valeur,
  long,
  id,
  decritPar,
  etiquette,
  type = "texte",
  projetId = null,
  max,
  lignes = 3,
}: {
  rapportId: string;
  champId: string;
  valeur: string;
  long?: boolean;
  /** Synthèse : un texte par projet. */
  projetId?: string | null;
  max?: number;
  lignes?: number;
  id: string;
  decritPar?: string;
  /** Identifiant du titre qui sert d'étiquette. */
  etiquette?: string;
  type?: "texte" | "nombre" | "date";
}) {
  const [texte, setTexte] = useState(valeur);
  const [, demarrer] = useTransition();
  const enregistrer = (v: string) => {
    if (v.trim() !== valeur) demarrer(() => repondre(rapportId, champId, projetId, v));
  };
  const style = { width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", border: "1px solid var(--controle)", background: "var(--champ)", color: "var(--encre)", fontSize: 15, lineHeight: "22px" };
  if (long) {
    return <textarea id={id} aria-labelledby={etiquette} aria-describedby={decritPar} rows={lignes} value={texte} maxLength={max ?? 2000} onChange={(e) => setTexte(e.target.value)} onBlur={() => enregistrer(texte)} style={{ ...style, resize: "vertical" }} />;
  }
  return (
    <input
      id={id}
      aria-labelledby={etiquette}
      aria-describedby={decritPar}
      type={type === "nombre" ? "text" : type === "date" ? "date" : "text"}
      inputMode={type === "nombre" ? "decimal" : undefined}
      value={texte}
      maxLength={300}
      onChange={(e) => {
        setTexte(e.target.value);
        if (type === "date") enregistrer(e.target.value);
      }}
      onBlur={() => type !== "date" && enregistrer(texte)}
      style={{ ...style, minHeight: 44, maxWidth: type === "texte" ? "100%" : 220 }}
    />
  );
}

/** Feu : une phrase pour expliquer ce qui n'est pas « dans les temps ». */
export function CommentaireFeu({ rapportId, champId, projetId, valeur, id }: { rapportId: string; champId: string; projetId: string; valeur: string; id: string }) {
  const [texte, setTexte] = useState(valeur);
  const [, demarrer] = useTransition();
  return (
    <input
      id={id}
      value={texte}
      maxLength={300}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        if (texte.trim() !== valeur) demarrer(() => commenter(rapportId, champId, projetId, texte));
      }}
      style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px", border: "1px solid var(--controle)", background: "var(--champ)", color: "var(--encre)", fontSize: 14 }}
    />
  );
}
