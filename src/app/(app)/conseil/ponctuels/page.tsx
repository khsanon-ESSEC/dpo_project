import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateLongue } from "@/lib/dates";
import { rapportsPonctuels } from "@/lib/donnees/conseil";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_CONSEIL, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Rapports ponctuels" };

const STATUT: Record<string, string> = { brouillon: "Brouillon", approuve: "Approuvé", envoye: "Envoyé" };

/** Rapports ponctuels au conseil : faits à tout moment, pour une demande ou un événement imprévu. */
export default async function PagePonctuels() {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  const liste = await rapportsPonctuels(await idsProjetsVisibles(a), u.id);
  return (
    <>
      <Bandeau surtitre="Rapports au conseil" titre="Rapports ponctuels">
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 640 }}>
          Pour une demande ou un événement imprévu : le même format que le rapport du mois, préparé le jour même à partir des fiches projet et des tâches.
        </p>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_CONSEIL} courant="/conseil/ponctuels" label="Rapports au conseil" />
        <div className="ligne-actions">
          <p className="note" style={{ margin: 0 }}>
            {liste.length ? `${liste.length} rapport${liste.length > 1 ? "s" : ""} ponctuel${liste.length > 1 ? "s" : ""}` : "Aucun rapport ponctuel pour l'instant."}
          </p>
          <a href="/conseil/ponctuels/nouveau" className="bouton-ambre">
            <Icone nom="ajouter" taille={18} /> Nouveau rapport ponctuel
          </a>
        </div>
        {liste.length ? (
          <section className="carte carte--liste" aria-label="Rapports ponctuels">
            <ul className="liste">
              {liste.map((r) => (
                <li key={r.id}>
                  <a href={`/conseil/ponctuels/${r.id}`} className="rangee" style={{ minHeight: 64, flexWrap: "wrap" }}>
                    <span className="rangee__texte" style={{ flex: "1 1 260px" }}>
                      <span className="rangee__titre">{r.titre}</span>
                      <span className="rangee__sous">
                        {dateLongue(r.dateRapport)}
                        {r.auteur ? ` · par ${r.auteur}` : ""}
                        {r.codes.length ? ` · ${r.codes.join(", ")}` : ""}
                      </span>
                    </span>
                    <span className={`marque-modele ${r.statut === "brouillon" ? "marque-modele--ambre" : "marque-modele--relief"}`}>{STATUT[r.statut] ?? r.statut}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
