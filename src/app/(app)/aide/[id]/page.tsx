import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ficheParId, type Fiche } from "@/lib/guide";
import { noterFicheOuverte, permisDuGuide } from "@/lib/donnees/guide";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { FaireMaintenant } from "../FaireMaintenant";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const f = ficheParId((await params).id);
  return { title: f ? `${f.titre} · Guide` : "Guide" };
}

/** Une fiche du guide : la question, le pas à pas, « Le faire maintenant », les fiches voisines. */
export default async function PageFiche({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigerUtilisateur();
  const f = ficheParId((await params).id);
  if (!f) notFound();
  const permis = await permisDuGuide(u);
  if (!permis(f.permis)) notFound();
  await noterFicheOuverte(f.id);
  const voisines = (f.voirAussi ?? []).map(ficheParId).filter((x): x is Fiche => !!x && permis(x.permis));

  return (
    <>
      <Bandeau
        surtitre={`Guide · ${f.theme}`}
        titre={f.titre}
        retour={
          <a href="/aide" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Guide
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: "22px", maxWidth: 640 }}>
          {f.question}
        </p>
      </Bandeau>
      <div className="page">
        <div className="colonnes">
          <div className="colonne-large">
          <section className="carte" aria-labelledby="guide-etapes">
            <h2 id="guide-etapes" className="carte__titre">
              Pas à pas
            </h2>
            <ol className="guide-etapes">
              {f.etapes.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ol>
            {f.astuce ? (
              <p className="guide-astuce">
                <strong>À savoir</strong> · {f.astuce}
              </p>
            ) : null}
            {f.faire ? (
              <div className="guide-faire">
                <FaireMaintenant libelle={f.faire.libelle} lien={f.faire.lien} barre={f.faire.barre} />
              </div>
            ) : null}
          </section>
          </div>
          <div className="colonne-etroite">
            {voisines.length ? (
              <section className="carte carte--liste" aria-labelledby="guide-voir-aussi">
                <h2 id="guide-voir-aussi" className="carte__titre">
                  Voir aussi
                </h2>
                <ul className="liste">
                  {voisines.map((v) => (
                    <li key={v.id}>
                      <a href={`/aide/${v.id}`} className="rangee">
                        <span className="rangee__texte">
                          <span className="rangee__titre">{v.titre}</span>
                          <span className="rangee__sous">{v.resume}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="carte" aria-labelledby="guide-autre">
              <h2 id="guide-autre" className="carte__titre">
                Une autre question ?
              </h2>
              <p className="note">
                Écrivez-la dans la barre du haut, en commençant par « comment », « où » ou « pourquoi ». Ou parcourez <a href="/aide">tout le guide</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
