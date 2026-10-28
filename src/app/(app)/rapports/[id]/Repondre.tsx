"use client";

import { useActionState, useEffect, useState } from "react";
import { Icone } from "@/components/Icone";
import { repondreAuRapport, type EtatReponse } from "./actions";

/** Le champ « Répondre » : vidé après l'envoi ; l'erreur s'affiche sous le champ. */
export function Repondre({ rapportId, aide, exemple }: { rapportId: string; aide: string; exemple: string }) {
  const [etat, agir, enCours] = useActionState<EtatReponse, FormData>(repondreAuRapport.bind(null, rapportId), { n: 0 });
  // Champ contrôlé : le texte reste en cas d'erreur ; il se vide seulement après un envoi réussi.
  const [texte, setTexte] = useState("");
  useEffect(() => {
    if (etat.n) setTexte("");
  }, [etat.n]);
  return (
    <form action={agir} className="repondre">
      <label htmlFor="reponse-texte" className="note" style={{ margin: 0 }}>
        {aide}
      </label>
      <textarea
        id="reponse-texte"
        name="texte"
        rows={3}
        maxLength={1000}
        placeholder={exemple}
        required
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        aria-describedby={etat.erreur ? "reponse-erreur" : undefined}
      />
      {etat.erreur ? (
        <p id="reponse-erreur" className="erreur" role="alert" style={{ margin: 0 }}>
          {etat.erreur}
        </p>
      ) : etat.n && !texte ? (
        <p className="succes" role="status" style={{ margin: 0 }}>
          Envoyé.
        </p>
      ) : null}
      <div className="repondre__boutons">
        <button type="submit" className="bouton-ambre" disabled={enCours}>
          <Icone nom="envoyer" taille={16} /> Envoyer
        </button>
        <BoutonImprimer />
      </div>
    </form>
  );
}

export function BoutonImprimer() {
  return (
    <button type="button" className="bouton-contour" onClick={() => window.print()}>
      <Icone nom="telecharger" taille={16} /> Imprimer ou PDF
    </button>
  );
}
