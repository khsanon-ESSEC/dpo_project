"use client";

import { useActionState, useState } from "react";
import { creerTache, type EtatNouvelleTache } from "../actions";
import { dateCourte, lundiDe } from "@/lib/dates";

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
  indications,
  projetParDefaut,
  pourParDefaut,
  retour,
  aujourdhui,
}: {
  projets: { id: string; code: string; titre: string }[];
  personnes: { id: string; nom: string }[];
  /** Personnes qu'on peut choisir pour une tâche hors projet (soi, les personnes suivies). */
  base: string[];
  /** Pour chaque projet qu'on dirige : son équipe, à qui on peut aussi confier ses tâches. */
  parProjet: Record<string, string[]>;
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
  const permis = new Set([...base, ...(parProjet[projet] ?? [])]);
  const choix = personnes.filter((p) => permis.has(p.id));
  const pourValide = permis.has(pour) ? pour : (choix[0]?.id ?? "");

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
        <input id="titre" name="titre" required maxLength={200} />
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="champ">
          <label htmlFor="assigneId">Pour</label>
          <select id="assigneId" name="assigneId" value={pourValide} onChange={(e) => setPour(e.target.value)}>
            {choix.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
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
          <input id="echeance" name="echeance" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        </div>
        <div className="champ" style={{ flex: "1 1 140px" }}>
          <label htmlFor="estimationHeures">Temps estimé (heures)</label>
          <input id="estimationHeures" name="estimationHeures" type="number" min={1} max={400} step={1} inputMode="numeric" />
        </div>
      </div>
      <p className="note">Le temps estimé sert à mesurer la charge de chacun. Sans estimation, une tâche compte pour 4 heures.</p>
      <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours}>
        {enCours ? "Création…" : "Créer la tâche"}
      </button>
    </form>
  );
}
