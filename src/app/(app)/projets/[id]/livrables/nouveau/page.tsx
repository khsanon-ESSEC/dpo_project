import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListeFiltrable } from "@/components/ListeFiltrable";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { nouveauLivrable } from "../../../gestion-actions";
import { donneesLivrables, retourLivrable } from "../commun";

export const metadata: Metadata = { title: "Nouveau livrable" };

/** Ajouter un livrable sur sa propre page, comme une nouvelle tâche : un nom, une date, un responsable. */
export default async function PageNouveauLivrable({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ retour?: string; erreur?: string; ajoute?: string }> }) {
  const { id } = await params;
  const { retour: retourDemande, erreur, ajoute } = await searchParams;
  const retour = retourLivrable(retourDemande);
  const { p, indicateurs, phases, enCours, optionsResponsable, modifiable } = await donneesLivrables(id);
  if (!modifiable) notFound();
  const annuler = retour === "liste" ? `/projets/${p.id}/livrables` : `/projets/${p.id}#livrables`;

  return (
    <>
      <Bandeau
        surtitre={`Livrable · ${p.code}`}
        titre="Nouveau livrable"
        retour={
          <a href={annuler} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {retour === "liste" ? "Livrables du projet" : p.titre}
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 640 }}>
          {p.titre} · {indicateurs.length} livrable{indicateurs.length > 1 ? "s" : ""} déjà prévu{indicateurs.length > 1 ? "s" : ""}. Le responsable est prévenu ; il détermine les tâches qui y mènent.
        </p>
      </Bandeau>
      <div className="page">
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : ajoute ? (
          <p className="succes" role="status">
            Livrable ajouté : son responsable est prévenu. Ajoutez le suivant.
          </p>
        ) : null}
        <form action={nouveauLivrable.bind(null, p.id)} className="carte" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
          <input type="hidden" name="retour" value={retour} />
          <div className="champ">
            <label htmlFor="nl-libelle">Livrable</label>
            <input id="nl-libelle" name="libelle" required maxLength={200} autoFocus placeholder="Ex. : Modèle conceptuel validé" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div className="champ" style={{ flex: "1 1 160px" }}>
              <label htmlFor="nl-date">Prévu le</label>
              <input id="nl-date" name="prevuLe" type="date" />
            </div>
            <div className="champ" style={{ flex: "2 1 260px", minWidth: 0 }}>
              <label htmlFor="nl-resp">Responsable</label>
              <ListeFiltrable id="nl-resp" name="responsableId" vide="Aucun" placeholder="Tapez un nom" options={optionsResponsable} aucun="Personne ne correspond à" />
            </div>
          </div>
          {phases.length ? (
            <div className="champ">
              <label htmlFor="nl-phase">Phase</label>
              <select id="nl-phase" name="phaseId" defaultValue={enCours?.id ?? ""}>
                <option value="">Aucune</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.nom}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="champ">
            <label htmlFor="nl-critere">Validé quand (facultatif)</label>
            <input id="nl-critere" name="critere" maxLength={500} placeholder="Ex. : maquettes signées par le métier" aria-describedby="nl-critere-aide" />
            <span className="aide" id="nl-critere-aide">
              Ce qui permet de dire que le livrable est atteint, quand vous le validerez.
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button type="submit" className="bouton-ambre">
              <Icone nom="ajouter" taille={18} /> Ajouter le livrable
            </button>
            <button type="submit" name="encore" value="1" className="bouton-contour">
              Ajouter et en saisir un autre
            </button>
            <a href={annuler} className="lien-discret">
              Annuler
            </a>
          </div>
        </form>
      </div>
    </>
  );
}
