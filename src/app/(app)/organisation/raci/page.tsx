import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { count, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { peutGererRaciType, raciType } from "@/lib/donnees/raci";
import { memeRaci, RACI_DPO } from "@/lib/raci";
import { Bandeau } from "@/components/Bandeau";
import { EditeurRaci } from "@/components/EditeurRaci";
import { ongletsOrganisation, SousOnglets } from "@/components/SousOnglets";
import { enregistrerLeRaciType, reprendreLeRaciDOrigine } from "./actions";

export const metadata: Metadata = { title: "RACI type" };

/** Organisation → RACI : le RACI type de la DPO, repris par tous les projets qui ne l'ont pas adapté. */
export default async function PageRaci({ searchParams }: { searchParams: Promise<{ erreur?: string; ok?: string; attention?: string }> }) {
  const { erreur, ok, attention } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  if (!peutGererRaciType(a)) notFound();
  const [raci, [{ n: adaptes }]] = await Promise.all([raciType(), db.select({ n: count() }).from(schema.raci).where(isNotNull(schema.raci.projetId))]);
  const onglets = ongletsOrganisation(u, a.toutVoir);
  return (
    <>
      <Bandeau surtitre="Organisation" titre="RACI type">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>activités</dt>
            <dd>{raci.lignes.length}</dd>
          </div>
          <div className="chiffre">
            <dt>rôles</dt>
            <dd>{raci.colonnes.length}</dd>
          </div>
          <div className="chiffre">
            <dt>projets qui l&apos;ont adapté</dt>
            <dd>{Number(adaptes)}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={onglets} courant="/organisation/raci" label="Organisation" />
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : ok ? (
          <p className="succes" role="status">
            RACI type enregistré : il s&apos;applique à tous les projets qui ne l&apos;ont pas adapté.{attention ? ` À vérifier : ${attention.slice(0, 600)}` : ""}
          </p>
        ) : null}
        <section className="carte" aria-labelledby="raci-type" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 id="raci-type" className="carte__titre" style={{ margin: 0 }}>
            Qui fait quoi, sur un projet de la DPO
          </h2>
          <p className="note" style={{ margin: 0 }}>
            Chaque rôle peut renvoyer aux personnes du projet : la fiche du projet affiche alors leurs noms sous le rôle (le sponsor métier, le chef de projet et le référent DPO, les membres de l&apos;équipe). Un projet qui s&apos;écarte de ce tableau l&apos;adapte depuis sa page « Modifier le projet ».
          </p>
          <EditeurRaci raci={raci} action={enregistrerLeRaciType} bouton="Enregistrer le RACI type" />
          {!memeRaci(raci, RACI_DPO) ? (
            <form action={reprendreLeRaciDOrigine}>
              <button type="submit" className="bouton-mini">
                Reprendre le tableau d&apos;origine (note de cadrage)
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
