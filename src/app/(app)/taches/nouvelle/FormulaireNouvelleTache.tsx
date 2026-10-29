"use client";

import { useActionState, useRef, useState } from "react";
import { LIBELLE_PRIORITE, PRIORITES } from "@/lib/suivi";
import { creerTache, type EtatNouvelleTache } from "../actions";
import { dateCourte, lundiDe } from "@/lib/dates";
import { ChoixPour, externesPermisPour, NOUVELLE_PERSONNE, type PersonneChoix } from "@/components/ChoixPour";
import { SaisieLigne, type ValeurLigne } from "@/components/SaisieLigne";

type Indication = { capacite: number; semaines: { semaine: string; heures: number | null; capacite: number; niveau: string }[] };

const NIVEAU: Record<string, { texte: string; classe: string }> = {
  libre: { texte: "libre", classe: "ton-ok" },
  normale: { texte: "charge normale", classe: "ton-ok" },
  chargee: { texte: "chargée", classe: "ton-veille" },
  surchargee: { texte: "surchargée", classe: "ton-retard" },
};

export function FormulaireNouvelleTache({
  projets,
  personnes,
  base,
  parProjet,
  parLivrable = {},
  livrables = {},
  livrableParDefaut = "",
  externesPartout,
  horsProjet = true,
  indications,
  projetParDefaut,
  pourParDefaut,
  retour,
  aujourdhui,
}: {
  projets: { id: string; code: string; titre: string }[];
  personnes: PersonneChoix[];
  /** Personnes qu'on peut choisir pour une tâche hors projet (soi, les personnes suivies). */
  base: string[];
  /** Pour chaque projet qu'on dirige : son équipe, à qui on peut aussi confier ses tâches. */
  parProjet: Record<string, string[]>;
  /** Pour chaque livrable dont on est responsable : l'équipe du projet, à qui on peut confier ses tâches. */
  parLivrable?: Record<string, string[]>;
  /** Les livrables de chaque projet (pas encore validés). */
  livrables?: Record<string, { id: string; libelle: string; prevuLe: string | null }[]>;
  livrableParDefaut?: string;
  /** Direction et exécutifs : personnes hors division sur tous les projets. */
  externesPartout: boolean;
  /** Hors projet, peut-on choisir une personne hors division ? (Non pour un accès limité.) */
  horsProjet?: boolean;
  indications: Record<string, Indication>;
  projetParDefaut: string;
  pourParDefaut: string;
  retour: string | null;
  aujourdhui: string;
}) {
  const [etat, action, enCours] = useActionState<EtatNouvelleTache, FormData>(creerTache, { message: null });
  const [pour, setPour] = useState(pourParDefaut || personnes[0]?.id || "");
  const [echeance, setEcheance] = useState("");
  const [projet, setProjet] = useState(projetParDefaut);
  const [livrable, setLivrable] = useState(livrableParDefaut);
  const [heures, setHeures] = useState("");
  const [pret, setPret] = useState(false);
  // Ce que la phrase du titre a rempli : si elle cesse de le dire, le champ revient à sa valeur d'avant
  // (sauf si on l'a changé à la main entre-temps).
  const rempli = useRef<{ projet?: string; pour?: string; echeance?: string; heures?: string }>({});
  const suivre = (v: ValeurLigne) => {
    setPret(!!v.texte.trim());
    const r = rempli.current;
    const appliquer = (cle: "projet" | "pour" | "echeance" | "heures", valeur: string | null, set: (f: (x: string) => string) => void, defaut: string) => {
      if (valeur) {
        set(() => valeur);
        r[cle] = valeur;
      } else if (r[cle] !== undefined) {
        const avant = r[cle];
        set((x) => (x === avant ? defaut : x));
        r[cle] = undefined;
      }
    };
    appliquer("projet", v.projet?.id ?? null, setProjet, projetParDefaut);
    appliquer("pour", v.personne?.id ?? null, setPour, pourParDefaut || personnes[0]?.id || "");
    appliquer("echeance", v.echeance, setEcheance, "");
    appliquer("heures", v.heures ? String(v.heures) : null, setHeures, "");
  };
  const livrablesDuProjet = livrables[projet] ?? [];
  const livrableValide = livrablesDuProjet.some((l) => l.id === livrable) ? livrable : "";
  const leLivrable = livrablesDuProjet.find((l) => l.id === livrableValide);
  const permis = new Set([...base, ...(parProjet[projet] ?? []), ...(parLivrable[livrableValide] ?? [])]);
  const externesPermis = externesPermisPour(projet, parProjet, externesPartout, horsProjet);
  const apres = !!leLivrable?.prevuLe && !!echeance && echeance > leLivrable.prevuLe;
  const choix = personnes.filter((p) => permis.has(p.id) || (p.externe && externesPermis));
  const pourValide = pour === NOUVELLE_PERSONNE && externesPermis ? pour : choix.some((p) => p.id === pour) ? pour : (choix[0]?.id ?? "");

  // Charge de la personne choisie, la semaine de l'échéance (ou cette semaine).
  const semaine = lundiDe(echeance || aujourdhui);
  const ind = indications[pourValide]?.semaines.find((s) => s.semaine === semaine);
  const nom = personnes.find((p) => p.id === pourValide)?.nom ?? "";
  const n = ind ? NIVEAU[ind.niveau] : null;

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {retour ? <input type="hidden" name="retour" value={retour} /> : null}
      {etat.message ? (
        <p className="erreur" role="alert">
          {etat.message}
        </p>
      ) : null}
      <div className="champ">
        <label htmlFor="titre">Titre</label>
        <SaisieLigne
          id="titre"
          libelle={null}
          placeholder="Ex. : Relire les maquettes UR pour Fabienne vendredi 3h"
          projets={projets}
          personnes={choix}
          moiId={personnes.find((p) => p.nom === "Moi")?.id}
          aujourdhui={aujourdhui}
          heures
          sansProjet={null}
          noms={{ texte: "titre" }}
          autoFocus
          onValeur={suivre}
        />
        <p className="note" style={{ margin: 0 }}>
          Écrivez la tâche d&apos;une traite : le projet (son code, « projet … » ou « / »), la personne (« pour … » ou « @ »), l&apos;échéance et le temps se
          reportent dans les champs ci-dessous.
        </p>
      </div>
      <div className="champ">
        <label htmlFor="description">Précisions (facultatif)</label>
        <textarea id="description" name="description" rows={2} maxLength={4000} />
      </div>
      <div className="champ">
        <label htmlFor="projetId">Projet</label>
        <select id="projetId" name="projetId" value={projet} onChange={(e) => setProjet(e.target.value)}>
          <option value="">Hors projet</option>
          {projets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titre}
            </option>
          ))}
        </select>
      </div>
      {livrablesDuProjet.length ? (
        <div className="champ">
          <label htmlFor="livrableId">Livrable</label>
          <select id="livrableId" name="livrableId" value={livrableValide} onChange={(e) => setLivrable(e.target.value)} aria-describedby="livrableId-aide">
            <option value="">Aucun (tâche hors livrable)</option>
            {livrablesDuProjet.map((l) => (
              <option key={l.id} value={l.id}>
                {l.libelle}
                {l.prevuLe ? ` · prévu le ${dateCourte(l.prevuLe)}` : ""}
              </option>
            ))}
          </select>
          <span className="aide" id="livrableId-aide">
            Le livrable auquel cette tâche mène.
          </span>
        </div>
      ) : null}
      <div className="champ" style={{ maxWidth: 220 }}>
        <label htmlFor="priorite">Priorité</label>
        <select id="priorite" name="priorite" defaultValue="normale">
          {PRIORITES.map((x) => (
            <option key={x} value={x}>
              {LIBELLE_PRIORITE[x]}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ChoixPour id="assigneId" personnes={personnes} permis={permis} externesPermis={externesPermis} valeur={pourValide} onChange={setPour} />
        {ind && n ? (
          <p className="note" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden="true" className={`point-niveau point-niveau--${ind.niveau}`} />
            <span>
              {nom === "Moi" ? "Vous" : nom}, semaine du {dateCourte(semaine)} :{" "}
              {ind.heures !== null ? (
                <>
                  {String(ind.heures).replace(".", ",")} h prévues sur {String(ind.capacite).replace(".", ",")} h ·{" "}
                </>
              ) : null}
              <span className={n.classe}>{n.texte}</span>
            </span>
          </p>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div className="champ" style={{ flex: "1 1 160px" }}>
          <label htmlFor="debut">Début</label>
          <input id="debut" name="debut" type="date" />
        </div>
        <div className="champ" style={{ flex: "1 1 160px" }}>
          <label htmlFor="echeance">Échéance</label>
          <input id="echeance" name="echeance" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} aria-describedby={apres ? "echeance-apres" : undefined} />
          {apres && leLivrable?.prevuLe ? (
            <span className="aide ton-veille" id="echeance-apres" role="status">
              Après la date du livrable ({dateCourte(leLivrable.prevuLe)}) : il prendra du retard.
            </span>
          ) : null}
        </div>
        <div className="champ" style={{ flex: "1 1 140px" }}>
          <label htmlFor="estimationHeures">Temps estimé (heures)</label>
          <input id="estimationHeures" name="estimationHeures" type="number" min={1} max={400} step={1} inputMode="numeric" value={heures} onChange={(e) => setHeures(e.target.value)} />
        </div>
      </div>
      <p className="note">Le temps estimé sert à mesurer la charge de chacun. Sans estimation, une tâche compte pour 4 heures.</p>
      <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours || !pret}>
        {enCours ? "Création…" : "Créer la tâche"}
      </button>
    </form>
  );
}
