import type { Metadata } from "next";
import { objectifsDesProjets } from "@/lib/donnees/objectifs";
import { notFound } from "next/navigation";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateCourte, dateLocale, dateLongue } from "@/lib/dates";
import { lignesConseil, projetsPourRapport, rapportConseil } from "@/lib/donnees/conseil";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, peutModifierRapportConseil } from "@/lib/regles";
import { iaDisponible } from "@/lib/ia";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { ajouterProjet, approuver, modifierPonctuel } from "../../actions";
import { EtapesConseil, TableauConseil } from "../../TableauConseil";

export const metadata: Metadata = { title: "Rapport ponctuel" };

export default async function PagePonctuel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  const r = await rapportConseil(id);
  if (!r || r.genre !== "ponctuel") notFound();
  const visibles = await idsProjetsVisibles(a);
  const lignes = (await lignesConseil(r.id, r.statut)).filter((l) => visibles === "tous" || visibles.has(l.projet.id));
  if (!lignes.length && r.creeParId !== u.id && !a.toutVoir) notFound();
  const brouillon = r.statut === "brouillon";
  const modifiable = peutModifierRapportConseil({ moiId: u.id, toutVoir: a.toutVoir }, r);
  const org = await chargerOrganisation();
  const auteur = r.creeParId ? org.personnes.get(r.creeParId) : undefined;
  const approuvePar = r.approuveParId ? org.personnes.get(r.approuveParId) : undefined;
  const autres = modifiable ? (await projetsPourRapport(visibles)).filter((p) => !lignes.some((l) => l.projet.id === p.id)) : [];
  const changees = lignes.filter((l) => l.ligne.dateFinDernierRapport && l.ligne.nouvelleDateFin !== l.ligne.dateFinDernierRapport).length;

  return (
    <>
      <Bandeau
        surtitre={`Rapport ponctuel · ${dateLongue(r.dateRapport)}`}
        titre={r.titre}
        retour={
          <a href="/conseil/ponctuels" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Rapports ponctuels
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 680 }}>
          {r.depuis ? `Période depuis le ${dateLongue(r.depuis)}. ` : ""}
          {auteur ? (
            <>
              Préparé par <LienPersonne id={auteur.id}>{nomComplet(auteur)}</LienPersonne>.
            </>
          ) : null}
        </p>
        <EtapesConseil statut={r.statut} />
      </Bandeau>
      <div className="page">
        <div className="ligne-actions">
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 40px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <dd style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 200 }}>{lignes.length}</dd>
              <dt className="note">projet{lignes.length > 1 ? "s" : ""}</dt>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <dd className={changees ? "ton-retard" : undefined} style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 200 }}>
                {changees}
              </dd>
              <dt className="note">date{changees > 1 ? "s" : ""} changée{changees > 1 ? "s" : ""} depuis le dernier rapport mensuel</dt>
            </div>
          </dl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a href={`/conseil/comparer?b=${r.id}`} className="bouton-contour">
              <Icone nom="colonnes" taille={18} /> Comparer
            </a>
            <a href={`/api/conseil/ponctuel/${r.id}/word`} className={brouillon ? "bouton-contour" : "bouton-ambre"}>
              <Icone nom="telecharger" taille={18} /> Fichier Word
            </a>
            {brouillon && a.toutVoir ? (
              <form action={approuver.bind(null, r.id)}>
                <button type="submit" className="bouton-ambre">
                  Approuver le rapport
                </button>
              </form>
            ) : null}
          </div>
        </div>
        {brouillon ? (
          <p className="note">
            Les états d&apos;avancement sont préparés à partir des fiches projet et des tâches terminées depuis le début de la période. Relisez-les avant l&apos;envoi.
            {a.toutVoir ? "" : " Un exécutif approuve le rapport."} Ce rapport ne change pas les dates du rapport mensuel.
          </p>
        ) : (
          <p className="succes">
            Approuvé
            {approuvePar ? (
              <>
                {" par "}
                <LienPersonne id={approuvePar.id}>{nomComplet(approuvePar)}</LienPersonne>
              </>
            ) : null}
            {r.approuveLe ? ` le ${dateCourte(dateLocale(r.approuveLe))}` : ""} : états et dates sont figés.
          </p>
        )}

        {modifiable ? (
          <section className="carte" aria-labelledby="p-objet-titre" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 id="p-objet-titre" className="carte__titre" style={{ margin: 0 }}>
              Objet du rapport
            </h2>
            <form action={modifierPonctuel.bind(null, r.id)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="champ">
                <label htmlFor="po-titre">Titre</label>
                <input id="po-titre" name="titre" defaultValue={r.titre} required maxLength={120} />
              </div>
              <div className="champ">
                <label htmlFor="po-objet">La demande ou l&apos;événement</label>
                <textarea id="po-objet" name="objet" rows={3} defaultValue={r.objet} maxLength={1500} />
              </div>
              <div>
                <button type="submit" className="bouton-contour">
                  <Icone nom="coche" taille={16} /> Enregistrer
                </button>
              </div>
            </form>
            {autres.length ? (
              <form action={ajouterProjet.bind(null, r.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="champ" style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <label htmlFor="po-projet">Ajouter un projet</label>
                  <select id="po-projet" name="projetId" defaultValue="" required style={{ maxWidth: "100%" }}>
                    <option value="" disabled>
                      Choisir un projet
                    </option>
                    {autres.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.titre}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="bouton-contour">
                  <Icone nom="ajouter" taille={16} /> Ajouter
                </button>
              </form>
            ) : null}
          </section>
        ) : r.objet ? (
          <section className="carte" aria-labelledby="p-objet-titre">
            <h2 id="p-objet-titre" className="carte__titre">
              Objet du rapport
            </h2>
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.objet}</p>
          </section>
        ) : null}

        <TableauConseil
          lignes={lignes}
          objectifs={await objectifsDesProjets(lignes.map((l) => l.projet.id))}
          visibles={visibles}
          brouillon={modifiable}
          ia={iaDisponible()}
          rapportRetirable={modifiable && lignes.length > 1 ? r.id : null}
          entete={
            <>
              <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 700 }}>DIVISION PRODUCTIVITÉ ET ORGANISATION</span>
              <span style={{ fontSize: 13 }}>{r.titre.toUpperCase()}</span>
              <span style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>
                RAPPORT PONCTUEL DU {dateLongue(r.dateRapport).toUpperCase()}
                {r.depuis ? ` · DEPUIS LE ${dateLongue(r.depuis).toUpperCase()}` : ""}
              </span>
              {r.objet ? (
                <span style={{ marginTop: 6, fontSize: 13, maxWidth: 640 }}>
                  <strong>Objet : </strong>
                  {r.objet}
                </span>
              ) : null}
            </>
          }
        />
      </div>
    </>
  );
}
