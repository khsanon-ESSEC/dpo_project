"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LIBELLE_MOTIF, MOTIFS_ABSENCE } from "@/lib/absences";
import { ajouterAbsence, type EtatAbsence } from "./actions";

/** Noter une absence : premier et dernier jour (le même pour une journée), et le motif. */
export function FormAbsence({ personneId, aujourdhui, min, max }: { personneId: string; aujourdhui: string; min: string; max: string }) {
  const [etat, agir, enCours] = useActionState<EtatAbsence, FormData>(ajouterAbsence.bind(null, personneId), { n: 0 });
  const [debut, setDebut] = useState(aujourdhui);
  const [fin, setFin] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (etat.n) {
      setDebut(aujourdhui);
      setFin("");
    }
  }, [etat.n, aujourdhui]);
  return (
    <form ref={form} action={agir} className="temps-form" aria-describedby="abs-aide">
      <div className="champ">
        <label htmlFor={`abs-debut-${personneId}`}>Du</label>
        <input id={`abs-debut-${personneId}`} name="debut" type="date" required min={min} max={max} value={debut} onChange={(e) => setDebut(e.target.value)} />
      </div>
      <div className="champ">
        <label htmlFor={`abs-fin-${personneId}`}>Au (inclus)</label>
        <input id={`abs-fin-${personneId}`} name="fin" type="date" min={debut || min} max={max} value={fin} onChange={(e) => setFin(e.target.value)} />
      </div>
      <div className="champ">
        <label htmlFor={`abs-motif-${personneId}`}>Motif</label>
        <select id={`abs-motif-${personneId}`} name="motif" defaultValue="conge">
          {MOTIFS_ABSENCE.map((m) => (
            <option key={m} value={m}>
              {LIBELLE_MOTIF[m]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="bouton-contour" disabled={enCours}>
        Noter l&apos;absence
      </button>
      <p id="abs-aide" className="note" style={{ flexBasis: "100%", margin: 0 }}>
        Une journée : laissez « Au » vide. Dans la barre aussi : « absent du 2/11 au 6/11 », « en formation jeudi ».
      </p>
      {etat.erreur ? (
        <p className="erreur" role="alert" style={{ flexBasis: "100%", margin: 0 }}>
          {etat.erreur}
        </p>
      ) : etat.message ? (
        <p className="succes" role="status" style={{ flexBasis: "100%", margin: 0 }}>
          {etat.message}
        </p>
      ) : null}
    </form>
  );
}
