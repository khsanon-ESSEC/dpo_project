import type { Metadata } from "next";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, dateLocale, moisAnnee } from "@/lib/dates";
import { portefeuille } from "@/lib/donnees/projets";
import { demandesDeProjet } from "@/lib/donnees/gestion";
import { peutDecider } from "@/lib/projets";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { Chronologie } from "./Chronologie";

export const metadata: Metadata = { title: "Projets" };

const SANTE = {
  en_retard: { texte: "En retard", classe: "ton-retard", point: "var(--retard-point)" },
  a_surveiller: { texte: "À surveiller", classe: "ton-veille", point: "var(--veille-point)" },
  dans_les_temps: { texte: "Dans les temps", classe: "ton-ok", point: "var(--ok-point)" },
} as const;

export default async function PagePortefeuille({ searchParams }: { searchParams: Promise<{ filtre?: string; vue?: string }> }) {
  const { filtre = "tous", vue: v } = await searchParams;
  const vue = v === "chronologie" ? "chronologie" : "cartes";
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const archives = filtre === "archives";
  const [tous, nArchives, demandes] = await Promise.all([portefeuille(a, { archives }), archives ? Promise.resolve(null) : portefeuille(a, { archives: true }).then((l) => l.length), demandesDeProjet(a, await idsProjetsVisibles(a))]);
  const projets = tous.filter((p) => filtre === "tous" || archives || (filtre === "strat" && p.strategique) || (filtre === "glisse" && p.glissementSemaines > 0));
  const decideur = peutDecider(a);
  const enAttente = demandes.filter((d) => d.statut === "requete");
  const miennes = demandes.filter((d) => d.demandeurId === u.id);
  const aMontrer = decideur ? demandes.filter((d) => d.statut === "requete" || d.demandeurId === u.id) : miennes;
  const totalInd = tous.reduce((s, p) => s + p.totalIndicateurs, 0);
  const atteints = tous.reduce((s, p) => s + p.atteints, 0);
  const filtres = [
    { id: "tous", libelle: `Tous · ${tous.length}` },
    { id: "strat", libelle: `Stratégiques · ${tous.filter((p) => p.strategique).length}` },
    { id: "glisse", libelle: `Date repoussée · ${tous.filter((p) => p.glissementSemaines > 0).length}` },
    ...(nArchives || archives ? [{ id: "archives", libelle: archives ? `Archivés · ${tous.length}` : `Archivés · ${nArchives}` }] : []),
  ];

  return (
    <>
      <Bandeau surtitre={`Division Projets Organisationnels · ${moisAnnee(aujourdhui())}`} titre={a.toutVoir ? "Portefeuille" : "Mes projets"}>
        <dl className="chiffres">
          <div className="chiffre">
            <dt>en cours</dt>
            <dd>{tous.length}</dd>
          </div>
          <div className="chiffre">
            <dt>stratégiques</dt>
            <dd>{tous.filter((p) => p.strategique).length}</dd>
          </div>
          <div className="chiffre chiffre--retard">
            <dt>en retard</dt>
            <dd>{tous.filter((p) => p.sante === "en_retard").length}</dd>
          </div>
          <div className="chiffre">
            <dt>des indicateurs atteints</dt>
            <dd>
              {totalInd ? Math.round((atteints / totalInd) * 100) : 0}
              <small>&nbsp;%</small>
            </dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <div className="ligne-actions">
          <nav className="filtres" aria-label="Filtrer les projets">
            {filtres.map((f) => (
              <a key={f.id} className="filtre" href={`/projets?filtre=${f.id}${vue === "chronologie" ? "&vue=chronologie" : ""}`} aria-current={filtre === f.id ? "true" : undefined}>
                {f.libelle}
              </a>
            ))}
          </nav>
          <nav className="zoom" aria-label="Affichage">
            <a href={`/projets?filtre=${filtre}`} aria-current={vue === "cartes" ? "true" : undefined}>
              Cartes
            </a>
            <a href={`/projets?filtre=${filtre}&vue=chronologie`} aria-current={vue === "chronologie" ? "true" : undefined}>
              Chronologie
            </a>
          </nav>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a href="/projets/nouveau" className="bouton-contour">
              <Icone nom="ajouter" taille={18} /> Proposer un projet
            </a>
            {a.toutVoir ? (
              <a href="/conseil" className="bouton-ambre">
                <Icone nom="document" taille={18} /> Rapport au conseil de {moisAnnee(aujourdhui()).split(" ")[0]}
              </a>
            ) : null}
          </div>
        </div>
        {aMontrer.length && !archives ? (
          <section className="carte carte--liste" aria-labelledby="p-demandes" style={decideur && enAttente.length ? { borderColor: "var(--veille-point)" } : undefined}>
            <h2 id="p-demandes" className="carte__titre">
              {decideur ? `Demandes de projet · ${enAttente.length} à décider` : "Mes demandes de projet"}
            </h2>
            <ul className="liste">
              {aMontrer.map((d) => (
                <li key={d.id}>
                  <a href={`/projets/${d.id}`} className="rangee" style={{ minHeight: 56, flexWrap: "wrap" }}>
                    <span className="etiquette-projet">{d.code}</span>
                    <span className="rangee__texte" style={{ flex: "1 1 220px" }}>
                      <span className="rangee__titre">{d.titre}</span>
                      <span className="rangee__sous">
                        {d.demandeur ? `Proposé par ${d.demandeur}` : "Proposé"}
                        {d.demandeLe ? ` le ${dateCourte(dateLocale(d.demandeLe))}` : ""}
                        {d.statut === "refuse" && d.motif ? ` · refusé : ${d.motif}` : ""}
                      </span>
                    </span>
                    <span className={`rangee__meta ${d.statut === "refuse" ? "ton-retard" : "ton-veille"}`}>{d.statut === "refuse" ? "Refusé" : decideur ? "À décider" : "En attente"}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {vue === "chronologie" ? <Chronologie projets={projets} /> : null}
        <div className="grille-projets" hidden={vue === "chronologie"}>
          {projets.map((p) => {
            const s = SANTE[p.sante];
            const glisse = p.glissementSemaines > 0;
            const debut = glisse ? 50 : 72;
            const courant = glisse ? Math.min(92, 50 + p.glissementSemaines * 8) : 72;
            return (
              <a key={p.id} href={`/projets/${p.id}`} className="carte-projet">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <span className="mono mono--fort" style={{ width: 36, height: 36, fontSize: 12 }} aria-hidden="true">
                    {p.code}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 16, lineHeight: "22px", fontWeight: 500 }}>{p.titre}</span>
                  {p.strategique ? <span className="etiquette-strategique">Stratégique</span> : null}
                  {p.division ? (
                    <span className="etiquette-hors" title={`Projet de la ${p.division}`}>
                      Autre division
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <Anneau fait={p.atteints} total={p.totalIndicateurs} taille={84} label={`${p.atteints} indicateurs vérifiables atteints sur ${p.totalIndicateurs}`} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="carte__titre" style={{ margin: 0, fontSize: 10, lineHeight: "12px" }}>
                      Fin prévue
                    </span>
                    <span style={{ fontSize: 26, lineHeight: "30px", fontWeight: 200 }}>{dateCourte(p.dateFinPrevue)}</span>
                    <div
                      className="glissement"
                      role="img"
                      aria-label={glisse ? `Fin prévue repoussée de ${p.glissementSemaines} semaines depuis le dernier rapport` : "Fin prévue inchangée depuis le dernier rapport"}
                    >
                      <span style={{ left: 0, right: 0, top: 6, height: 2, background: "var(--piste)" }} />
                      {glisse ? <span style={{ top: 6, height: 2, left: `${debut}%`, width: `${courant - debut}%`, background: s.point }} /> : null}
                      {glisse ? (
                        <span style={{ top: 3, left: `calc(${debut}% - 4px)`, width: 8, height: 8, borderRadius: "50%", border: "1.5px solid var(--controle)", background: "var(--surface)" }} />
                      ) : null}
                      <span style={{ top: 3, left: `calc(${courant}% - 4px)`, width: 8, height: 8, borderRadius: "50%", background: s.point }} />
                    </div>
                    <span className={glisse ? s.classe : "ton-discret"} style={{ fontSize: 12, lineHeight: "16px" }}>
                      {glisse ? `Repoussée de ${p.glissementSemaines} semaine${p.glissementSemaines > 1 ? "s" : ""}` : p.ancienneFin ? "Inchangée depuis le dernier rapport" : "Pas encore de rapport au conseil"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 16, borderTop: "1px solid var(--filet)" }}>
                  <span aria-label={`Équipe : ${p.equipe.length} personnes`} style={{ display: "flex", gap: 4 }}>
                    {p.equipe.map((i, n) => (
                      <span key={n} className="mono" style={{ width: 26, height: 26, fontSize: 10 }}>
                        {i}
                      </span>
                    ))}
                  </span>
                  <span className={`statut ${s.classe}`}>{s.texte}</span>
                </div>
              </a>
            );
          })}
          {projets.length === 0 ? <p className="vide">{archives ? "Aucun projet archivé." : "Aucun projet dans ce filtre."}</p> : null}
        </div>
      </div>
    </>
  );
}
