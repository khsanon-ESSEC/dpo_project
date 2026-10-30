"use client";

/**
 * « Le faire maintenant » d'une fiche du guide : un écran à ouvrir, ou une phrase commencée dans la barre du haut
 * (la barre écoute l'événement « barre:ecrire », src/components/BarreCommande.tsx).
 */
export function FaireMaintenant({ libelle, lien, barre }: { libelle: string; lien?: string; barre?: string }) {
  if (lien) {
    return (
      <a href={lien} className="bouton-ambre">
        {libelle}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="bouton-ambre"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.dispatchEvent(new CustomEvent("barre:ecrire", { detail: barre ?? "" }));
      }}
    >
      {libelle}
    </button>
  );
}
