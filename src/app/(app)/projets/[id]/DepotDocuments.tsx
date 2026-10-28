"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deposerDocumentsProjet } from "./actions";
import { Icone } from "@/components/Icone";
import { ACCEPT } from "@/lib/pieces";
import { CATEGORIES_DOCUMENT, categorieDevinee, ORDRE_CATEGORIES, type CategorieDocument } from "@/lib/documents";

/**
 * Joindre un document au projet : on choisit le fichier, la catégorie se propose d'après son nom
 * (« CDC… », « Spec… », « CR… ») et se change d'un clic. Pas de liste déroulante.
 */
export function DepotDocuments({ projetId }: { projetId: string }) {
  const [categorie, setCategorie] = useState<CategorieDocument>("autre");
  const [choisie, setChoisie] = useState(false);
  const [noms, setNoms] = useState<string[]>([]);
  return (
    <form action={deposerDocumentsProjet.bind(null, projetId)} className="depot-documents">
      <div className="champ">
        <label htmlFor="doc-fichiers">Ajouter un document</label>
        <input
          id="doc-fichiers"
          name="fichiers"
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => {
            const liste = [...(e.target.files ?? [])].map((f) => f.name);
            setNoms(liste);
            if (!choisie && liste[0]) setCategorie(categorieDevinee(liste[0]));
          }}
        />
        <span className="aide">PDF, Word, Excel, PowerPoint, images, CSV ou texte · 10 Mo au plus par fichier.</span>
      </div>
      <fieldset className="choix-categorie">
        <legend className="visuellement-cache">Catégorie du document</legend>
        {ORDRE_CATEGORIES.map((c) => (
          <label key={c} className={`puce-choix${categorie === c ? " puce-choix--active" : ""}`}>
            <input
              type="radio"
              name="categorie"
              value={c}
              checked={categorie === c}
              onChange={() => {
                setCategorie(c);
                setChoisie(true);
              }}
            />
            {CATEGORIES_DOCUMENT[c]}
          </label>
        ))}
      </fieldset>
      <BoutonJoindre n={noms.length} />
    </form>
  );
}

function BoutonJoindre({ n }: { n: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="bouton-contour" disabled={!n || pending} style={{ alignSelf: "flex-start" }}>
      <Icone nom="ajouter" taille={16} /> {pending ? "Envoi…" : n > 1 ? `Joindre les ${n} fichiers` : "Joindre"}
    </button>
  );
}
