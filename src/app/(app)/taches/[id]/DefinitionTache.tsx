"use client";

import { useActionState, useState } from "react";
import { definirTache, type EtatTache } from "../actions";
import { Icone } from "@/components/Icone";
import { ChoixPour, externesPermisPour, NOUVELLE_PERSONNE, type PersonneChoix } from "@/components/ChoixPour";
import { LIBELLE_PRIORITE, PRIORITES } from "@/lib/suivi";

/** Titre, précisions, projet et personne d'une tâche (la réassignation suit la règle d'assignation). */
export function DefinitionTache({
  tacheId,
  titre,
  description,
  projetId,
  livrableId = "",
  priorite = "normale",
  livrables = {},
  parLivrable = {},
  assigneId,
  projets,
  personnes,
  base,
  parProjet,
  externesPartout,
  horsProjet = true,
}: {
  tacheId: string;
  titre: string;
  description: string;
  projetId: string;
  livrableId?: string;
  priorite?: string;
  livrables?: Record<string, { id: string; libelle: string; prevuLe: string | null }[]>;
  parLivrable?: Record<string, string[]>;
  assigneId: string;
  projets: { id: string; code: string; titre: string }[];
  personnes: PersonneChoix[];
  base: string[];
  parProjet: Record<string, string[]>;
  externesPartout: boolean;
  /** Hors projet, peut-on choisir une personne hors division ? (Non pour un accès limité.) */
  horsProjet?: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatTache, FormData>(definirTache, { message: null });
  const [projet, setProjet] = useState(projetId);
  const [pour, setPour] = useState(assigneId);
  const [livrable, setLivrable] = useState(livrableId);
  const livrablesDuProjet = livrables[projet] ?? [];
  const livrableValide = livrablesDuProjet.some((l) => l.id === livrable) ? livrable : "";
  const permis = new Set([...base, ...(parProjet[projet] ?? []), ...(parLivrable[livrableValide] ?? []), assigneId]);
  const externesPermis = externesPermisPour(projet, parProjet, externesPartout, horsProjet);
  const choix = personnes.filter((p) => permis.has(p.id) || (p.externe && externesPermis));
  const pourValide = pour === NOUVELLE_PERSONNE && externesPermis ? pour : choix.some((p) => p.id === pour) ? pour : assigneId;
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
      </div>
      {livrablesDuProjet.length ? (
        <div className="champ">
          <label htmlFor="dt-livrable">Livrable</label>
          <select id="dt-livrable" name="livrableId" value={livrableValide} onChange={(e) => setLivrable(e.target.value)}>
            <option value="">Aucun (tâche hors livrable)</option>
            {livrablesDuProjet.map((l) => (
              <option key={l.id} value={l.id}>
                {l.libelle}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="livrableId" value="" />
      )}
      <div className="champ" style={{ maxWidth: 220 }}>
        <label htmlFor="dt-priorite">Priorité</label>
        <select id="dt-priorite" name="priorite" defaultValue={priorite}>
          {PRIORITES.map((x) => (
            <option key={x} value={x}>
              {LIBELLE_PRIORITE[x]}
            </option>
          ))}
        </select>
      </div>
      <ChoixPour id="dt-pour" libelle="Confiée à" personnes={personnes} permis={permis} externesPermis={externesPermis} valeur={pourValide} onChange={setPour} />
      <p className="note" style={{ margin: 0 }}>
        Vous pouvez confier une tâche à vous-même, aux personnes que vous suivez, et, sur un projet que vous dirigez (ou pour un livrable dont vous êtes responsable), aux membres de son équipe ; à une personne hors division (autre département, consultant), hors projet ou sur un projet que vous dirigez. Vous suivez alors la tâche pour elle.
      </p>
      <div>
        <button type="submit" className="bouton-contour" disabled={enCours}>
          <Icone nom="coche" taille={16} /> {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
