import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, premierDuMois } from "@/lib/dates";
import { projetsPourRapport } from "@/lib/donnees/conseil";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { creerPonctuel } from "../../actions";

export const metadata: Metadata = { title: "Nouveau rapport ponctuel" };

const STATUTS: Record<string, string> = { requete: "Requête", en_attente: "En attente", en_cours: "En cours", continu: "Continu", finalise: "Finalisé" };

export default async function PageNouveauPonctuel({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  const projets = await projetsPourRapport(await idsProjetsVisibles(a));
  const jour = aujourdhui();
  return (
    <>
      <Bandeau
        surtitre="Rapports au conseil"
        titre="Nouveau rapport ponctuel"
        retour={
          <a href="/conseil/ponctuels" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Rapports ponctuels
          </a>
        }
      />
      <div className="page" style={{ maxWidth: 760 }}>
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        <form action={creerPonctuel} className="carte" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="champ">
            <label htmlFor="p-titre">Titre</label>
            <input id="p-titre" name="titre" required maxLength={120} placeholder="Ex. : Point de situation après la panne du 26 octobre" />
          </div>
          <div className="champ">
            <label htmlFor="p-objet">La demande ou l&apos;événement</label>
            <textarea id="p-objet" name="objet" rows={3} maxLength={1500} aria-describedby="p-objet-aide" />
            <span className="aide" id="p-objet-aide">
              Qui le demande et pourquoi. Il figure en tête du fichier Word, et l&apos;assistant s&apos;en sert pour rédiger.
            </span>
          </div>
          <div className="champ">
            <label htmlFor="p-depuis">Période couverte, depuis le</label>
            <input id="p-depuis" name="depuis" type="date" defaultValue={premierDuMois(jour)} max={jour} aria-describedby="p-depuis-aide" style={{ maxWidth: 220 }} />
            <span className="aide" id="p-depuis-aide">
              Les tâches terminées depuis cette date sont citées dans l&apos;état d&apos;avancement de chaque projet.
            </span>
          </div>
          <fieldset className="editeur__choix" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 500, marginBottom: 8 }}>Projets</legend>
            <span className="note" style={{ marginBottom: 8, display: "block" }}>
              Les projets stratégiques sont cochés ; ajoutez ou retirez ceux que la demande concerne.
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {projets.map((p) => (
                <label key={p.id} className="choix-radio">
                  <input type="checkbox" name="projets" value={p.id} defaultChecked={p.strategique && p.statut !== "finalise" && !p.division} />
                  <span className="rangee__texte">
                    <span>
                      <span className="etiquette-projet" style={{ marginRight: 6 }}>
                        {p.code}
                      </span>
                      {p.titre}
                    </span>
                    <span className="rangee__sous">
                      {p.strategique ? "Stratégique · " : ""}
                      {p.division ? `${p.division} · ` : ""}
                      {STATUTS[p.statut] ?? p.statut}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <button type="submit" className="bouton-ambre">
              Préparer le rapport
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
