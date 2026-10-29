import { ListeFiltrable } from "@/components/ListeFiltrable";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { ajouterJours, lundiDe, moisAnnee } from "@/lib/dates";
import { auteursDontJeLisLesRapports, historiqueDe, rapportsDeLEquipe, semaineCourante } from "@/lib/donnees/rapport";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { LigneResume, semaineTexte } from "@/components/ResumeRapport";
import { ONGLETS_EQUIPE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Rapports de l'équipe" };

/**
 * Rapports de l'équipe : semaine par semaine (qui a envoyé, ce qu'il a fait), ou l'historique
 * d'une personne. Seulement les personnes dont on peut lire les rapports en entier.
 */
export default async function PageRapportsEquipe({ searchParams }: { searchParams: Promise<{ semaine?: string; personne?: string }> }) {
  const { semaine: s0, personne } = await searchParams;
  const u = await exigerInterne();
  const a = await acces(u);
  const org = await chargerOrganisation();
  const auteurs = await auteursDontJeLisLesRapports(a);
  const options = auteurs
    .map((id) => org.personnes.get(id)!)
    .filter((p) => p.actif)
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
  const courante = semaineCourante();

  // ---------- Historique d'une personne ----------
  if (personne) {
    if (!auteurs.includes(personne)) notFound();
    const p = org.personnes.get(personne)!;
    const liste = await historiqueDe(a, personne);
    const mois = [...new Set(liste.map((r) => r.semaine.slice(0, 7)))];
    return (
      <>
        <Bandeau
          surtitre="Rapports du vendredi"
          titre={<LienPersonne id={p.id}>{nomComplet(p)}</LienPersonne>}
          retour={
            <a href="/equipe/rapports" className="retour">
              <Icone nom="chevron-gauche" taille={18} /> Rapports de l&apos;équipe
            </a>
          }
        >
          <dl className="chiffres">
            <div className="chiffre">
              <dt>rapports envoyés</dt>
              <dd>{liste.length}</dd>
            </div>
            <div className="chiffre">
              <dt>dernier envoi</dt>
              <dd style={{ fontSize: 22, lineHeight: "54px", fontWeight: 300 }}>{liste[0] ? `semaine ${semaineTexte(liste[0].semaine)}` : "—"}</dd>
            </div>
          </dl>
        </Bandeau>
        <div className="page">
          <SousOnglets onglets={ONGLETS_EQUIPE} courant="/equipe/rapports" label="Équipe" />
          <ChoixPersonne options={options} choisie={personne} />
          {liste.length === 0 ? <p className="vide">Aucun rapport envoyé.</p> : null}
          <div className="cartes-en-grille">
          {mois.map((m) => (
            <section key={m} className="carte carte--liste" aria-labelledby={`m-${m}`}>
              <h2 id={`m-${m}`} className="carte__titre">
                {moisAnnee(`${m}-01`)}
              </h2>
              <ul className="liste">
                {liste
                  .filter((r) => r.semaine.startsWith(m))
                  .map((r) => (
                    <li key={r.id}>
                      <LigneResume r={r} lien={`/rapports/${r.id}`} titre={`${r.semaine === courante ? "Cette semaine" : "Semaine"} ${semaineTexte(r.semaine)}`} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          </div>
        </div>
      </>
    );
  }

  // ---------- Une semaine ----------
  const semaine = s0 && /^\d{4}-\d{2}-\d{2}$/.test(s0) && lundiDe(s0) <= courante ? lundiDe(s0) : courante;
  const lignes = await rapportsDeLEquipe(a, semaine);
  const recus = lignes.filter((l) => l.rapport).length;
  const equipes = [...new Set(lignes.map((l) => l.equipe))];

  return (
    <>
      <Bandeau surtitre="Rapports du vendredi" titre="Rapports de l'équipe">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>reçus, semaine {semaineTexte(semaine)}</dt>
            <dd>
              {recus}
              <small>&nbsp;/ {lignes.length}</small>
            </dd>
          </div>
          <div className={`chiffre ${lignes.some((l) => l.rapport?.comptes.bloque) ? "chiffre--veille" : ""}`}>
            <dt>points bloqués signalés</dt>
            <dd>{lignes.reduce((s, l) => s + (l.rapport?.comptes.bloque ?? 0), 0)}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_EQUIPE} courant="/equipe/rapports" label="Équipe" />
        <div className="ligne-actions">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href={`/equipe/rapports?semaine=${ajouterJours(semaine, -7)}`} className="bouton-icone" aria-label="Semaine précédente" title="Semaine précédente">
              <Icone nom="chevron-gauche" taille={20} />
            </a>
            <h2 style={{ margin: 0, minWidth: 220, textAlign: "center", fontSize: 20, lineHeight: "26px", fontWeight: 300 }}>
              {semaine === courante ? "Cette semaine" : `Semaine ${semaineTexte(semaine)}`}
            </h2>
            {semaine < courante ? (
              <a href={`/equipe/rapports?semaine=${ajouterJours(semaine, 7)}`} className="bouton-icone" aria-label="Semaine suivante" title="Semaine suivante">
                <Icone nom="chevron-droite" taille={20} />
              </a>
            ) : (
              <span style={{ width: 44 }} />
            )}
          </div>
          <ChoixPersonne options={options} />
        </div>
        {lignes.length === 0 ? <p className="vide">Personne ne vous envoie de rapport pour le moment.</p> : null}
        <div className="cartes-en-grille">
        {equipes.map((eq) => (
          <section key={eq} className="carte carte--liste" aria-label={eq}>
            {equipes.length > 1 ? <h2 className="carte__titre">{eq}</h2> : null}
            <ul className="liste">
              {lignes
                .filter((l) => l.equipe === eq)
                .map((l) => (
                  <li key={l.id} style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
                    <a href={`/personnes/${l.id}`} className="mono" style={{ marginTop: 18 }} aria-label={`Fiche de ${l.nom}`} title={l.nom}>
                      {l.initiales}
                    </a>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {l.rapport ? (
                        <LigneResume r={l.rapport} lien={`/rapports/${l.rapport.id}`} titre={l.nom} sous={l.poste} />
                      ) : (
                        <div className="rangee" style={{ minHeight: 72, gap: 16 }}>
                          <span className="rangee__texte">
                            <span className="rangee__titre" style={{ fontWeight: 500 }}>
                              <LienPersonne id={l.id}>{l.nom}</LienPersonne>
                            </span>
                            <span className="rangee__sous">{l.poste}</span>
                          </span>
                          <span className={semaine === courante ? "ton-veille" : "ton-retard"} style={{ fontSize: 12 }}>
                            {semaine === courante ? "Pas encore envoyé" : "Pas de rapport cette semaine-là"}
                          </span>
                        </div>
                      )}
                    </div>
                    <a href={`/equipe/rapports?personne=${l.id}`} className="bouton-icone" style={{ alignSelf: "center" }} aria-label={`Historique de ${l.nom}`} title={`Historique de ${l.nom}`}>
                      <Icone nom="historique" taille={18} />
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        </div>
        <p className="note">
          L&apos;icône <Icone nom="historique" taille={14} /> ouvre tous les rapports d&apos;une personne. Votre propre historique est dans Rapport → Mes rapports.
        </p>
      </div>
    </>
  );
}

/** Choisir une personne pour voir son historique (formulaire simple, fonctionne sans JavaScript). */
function ChoixPersonne({ options, choisie }: { options: { id: string; prenom: string; nom: string }[]; choisie?: string }) {
  if (!options.length) return null;
  return (
    <form action="/equipe/rapports" method="get" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <label htmlFor="personne" className="note">
        Historique de
      </label>
      <ListeFiltrable
        id="personne"
        name="personne"
        defaultValue={choisie ?? ""}
        required
        placeholder="Tapez un nom"
        aucun="Personne ne correspond à"
        className="liste-filtrable--ligne"
        options={options.map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
      />
      <button type="submit" className="bouton-contour">
        Voir
      </button>
    </form>
  );
}
