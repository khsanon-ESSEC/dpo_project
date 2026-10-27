"use client";

import { useActionState, useState } from "react";
import { definirTache, type EtatTache } from "../actions";
import { Icone } from "@/components/Icone";

/** Titre, précisions, projet et personne d'une tâche (la réassignation suit la règle d'assignation). */
export function DefinitionTache({
  tacheId,
  titre,
  description,
  projetId,
  assigneId,
  projets,
  personnes,
  base,
  parProjet,
}: {
  tacheId: string;
  titre: string;
  description: string;
  projetId: string;
  assigneId: string;
  projets: { id: string; code: string; titre: string }[];
  personnes: { id: string; nom: string }[];
  base: string[];
  parProjet: Record<string, string[]>;
}) {
  const [etat, action, enCours] = useActionState<EtatTache, FormData>(definirTache, { message: null });
  const [projet, setProjet] = useState(projetId);
  const [pour, setPour] = useState(assigneId);
  const permis = new Set([...base, ...(parProjet[projet] ?? []), assigneId]);
  const choix = personnes.filter((p) => permis.has(p.id));
  return (
    <form action={action} className="carte" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="tacheId" value={tacheId} />
      <h2 className="carte__titre" style={{ margin: 0 }}>
        La tâche
      </h2>
      {etat.message ? (
        <p className="erreur" role="alert" style={{ margin: 0 }}>
          {etat.message}
        </p>
      ) : etat.ok ? (
        <p className="succes" role="status" style={{ margin: 0 }}>
          Enregistré.
        </p>
      ) : null}
      <div className="champ">
        <label htmlFor="dt-titre">Titre</label>
        <input id="dt-titre" name="titre" defaultValue={titre} required maxLength={200} />
      </div>
      <div className="champ">
        <label htmlFor="dt-description">Précisions</label>
        <textarea id="dt-description" name="description" rows={3} defaultValue={description} maxLength={4000} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div className="champ" style={{ flex: "1 1 220px", minWidth: 0 }}>
          <label htmlFor="dt-projet">Projet</label>
          <select id="dt-projet" style={{ width: "100%" }} name="projetId" value={projet} onChange={(e) => setProjet(e.target.value)}>
            <option value="">Hors projet</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.titre}
              </option>
            ))}
          </select>
        </div>
        <div className="champ" style={{ flex: "1 1 200px", minWidth: 0 }}>
          <label htmlFor="dt-pour">Confiée à</label>
          <select id="dt-pour" style={{ width: "100%" }} name="assigneId" value={permis.has(pour) ? pour : assigneId} onChange={(e) => setPour(e.target.value)}>
            {choix.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="note" style={{ margin: 0 }}>
        Vous pouvez confier une tâche à vous-même, aux personnes que vous suivez, et, sur un projet que vous dirigez, aux membres de son équipe. La personne est prévenue.
      </p>
      <div>
        <button type="submit" className="bouton-contour" disabled={enCours}>
          <Icone nom="coche" taille={16} /> {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
