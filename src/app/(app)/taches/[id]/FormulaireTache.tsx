"use client";

import { useActionState, useState } from "react";
import { enregistrerTache, type EtatTache } from "../actions";
import { Icone } from "@/components/Icone";

const ETATS = [
  { id: "a_faire", libelle: "À faire", icone: "horloge" },
  { id: "en_cours", libelle: "En cours", icone: "sablier" },
  { id: "bloquee", libelle: "Bloquée", icone: "interdit" },
  { id: "faite", libelle: "Faite", icone: "coche" },
];

export function FormulaireTache({
  tacheId,
  statut,
  blocage,
  echeance,
  debut,
  estimationHeures,
  chefPrenom,
  retour,
}: {
  tacheId: string;
  statut: string;
  blocage: string;
  echeance: string;
  debut: string;
  estimationHeures: number | null;
  chefPrenom: string | null;
  retour: string | null;
}) {
  const [etat, action, enCours] = useActionState<EtatTache, FormData>(enregistrerTache, { message: null });
  const [choix, setChoix] = useState(statut);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <input type="hidden" name="tacheId" value={tacheId} />
      {retour ? <input type="hidden" name="retour" value={retour} /> : null}
      {etat.message ? (
        <p className="erreur" role="alert">
          {etat.message}
        </p>
      ) : null}
      <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
        <legend className="carte__titre" style={{ marginBottom: 12 }}>
          État
        </legend>
        <div className="choix-etat">
          {ETATS.map((e) => (
            <label key={e.id}>
              <input type="radio" name="statut" value={e.id} checked={choix === e.id} onChange={() => setChoix(e.id)} />
              <Icone nom={e.icone} />
              {e.libelle}
            </label>
          ))}
        </div>
      </fieldset>
      {choix === "bloquee" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="champ">
            <label htmlFor="blocage">Ce qui bloque</label>
            <textarea id="blocage" name="blocage" rows={3} defaultValue={blocage} required maxLength={1000} />
          </div>
          {chefPrenom ? (
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44, fontSize: 15 }}>
              Prévenir {chefPrenom}
              <input type="checkbox" name="prevenir" defaultChecked style={{ width: 22, height: 22, accentColor: "var(--arc)" }} />
            </label>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div className="champ" style={{ flex: "1 1 160px" }}>
          <label htmlFor="debut">Début</label>
          <input id="debut" name="debut" type="date" defaultValue={debut} />
        </div>
        <div className="champ" style={{ flex: "1 1 160px" }}>
          <label htmlFor="echeance">Échéance</label>
          <input id="echeance" name="echeance" type="date" defaultValue={echeance} />
        </div>
        <div className="champ" style={{ flex: "1 1 140px" }}>
          <label htmlFor="estimationHeures">Temps estimé (heures)</label>
          <input id="estimationHeures" name="estimationHeures" type="number" min={1} max={400} step={1} inputMode="numeric" defaultValue={estimationHeures ?? ""} />
        </div>
      </div>
      <div className="champ">
        <label htmlFor="note">Où en êtes-vous ? (facultatif)</label>
        <input id="note" name="note" type="text" maxLength={500} placeholder="Par exemple : aux trois quarts" />
      </div>
      <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
