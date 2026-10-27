import type { Metadata } from "next";
import { ajouterJours, aujourdhui, dateCourte, dateLocale, ecartJours } from "@/lib/dates";
import { debutPrevu, heuresDe, heuresTexte } from "@/lib/charge";
import { Gantt, LIBELLE_ZOOM, type BarreGantt, type LigneGantt, type Zoom } from "@/components/Gantt";
import { chargerVueProjet, cheminVue, EnTeteVue, LIBELLE_STATUT } from "../commun";

export const metadata: Metadata = { title: "Gantt du projet" };

export default async function PageGantt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ zoom?: string }> }) {
  const { id } = await params;
  const { zoom: z } = await searchParams;
  const zoom: Zoom = z === "jour" || z === "mois" ? z : "semaine";
  const ctx = await chargerVueProjet(id);
  const { projet, taches } = ctx;
  const jour = aujourdhui();
  const retour = encodeURIComponent(cheminVue(id, "gantt"));

  // Période de chaque tâche : début saisi (ou déduit de l'échéance et de l'estimation), jusqu'à l'échéance ;
  // pour une tâche faite, jusqu'au jour où elle a été terminée.
  const periodes = taches.map((t) => {
    const fin = t.statut === "faite" && t.termineeLe ? dateLocale(t.termineeLe) : (t.echeance ?? t.debut);
    const debut = debutPrevu(t) ?? fin;
    return { t, debut: debut && fin && debut > fin ? fin : debut, fin };
  });
  const datees = periodes.filter((p) => p.debut && p.fin) as { t: (typeof taches)[number]; debut: string; fin: string }[];

  // Fenêtre affichée : les tâches et aujourd'hui ; en zoom « mois », toute la vie du projet (au plus deux ans).
  const dates = [jour, ...datees.flatMap((p) => [p.debut, p.fin])];
  if (zoom === "mois") {
    if (projet.dateEntree && ecartJours(projet.dateEntree, jour) < 730) dates.push(projet.dateEntree);
    if (projet.dateFinPrevue) dates.push(projet.dateFinPrevue);
    if (projet.dateLancementPrevue) dates.push(projet.dateLancementPrevue);
  } else if (projet.dateFinPrevue && ecartJours(dates.reduce((a, b) => (a > b ? a : b)), projet.dateFinPrevue) < 45) dates.push(projet.dateFinPrevue);
  const debut = ajouterJours(dates.reduce((a, b) => (a < b ? a : b)), zoom === "jour" ? -2 : -5);
  const fin = ajouterJours(dates.reduce((a, b) => (a > b ? a : b)), zoom === "jour" ? 3 : 10);

  // Ligne du projet : sa durée, le retard sur la fin initiale (hachuré), les jalons.
  const barresProjet: BarreGantt[] = [];
  if (projet.dateEntree && projet.dateFinPrevue) {
    const finInitiale = projet.dateFinInitiale && projet.dateFinInitiale < projet.dateFinPrevue ? projet.dateFinInitiale : projet.dateFinPrevue;
    barresProjet.push({ debut: projet.dateEntree, fin: finInitiale, classe: "gantt__barre--projet", titre: `Projet : du ${dateCourte(projet.dateEntree)} au ${dateCourte(projet.dateFinPrevue)}` });
    if (finInitiale < projet.dateFinPrevue) {
      barresProjet.push({ debut: ajouterJours(finInitiale, 1), fin: projet.dateFinPrevue, classe: "gantt__barre--prolongee", titre: `Retard sur la fin initiale : ${Math.round(ecartJours(finInitiale, projet.dateFinPrevue) / 7)} semaines` });
    }
  }
  const lignes: LigneGantt[] = [
    {
      id: "projet",
      libelle: projet.titre,
      sous: projet.dateFinPrevue ? `Fin prévue le ${dateCourte(projet.dateFinPrevue)}` : "Activité continue",
      groupe: true,
      barres: barresProjet,
      jalons: [
        ...(projet.dateFinInitiale && projet.dateFinInitiale !== projet.dateFinPrevue ? [{ date: projet.dateFinInitiale, type: "initial" as const, titre: `Fin prévue initialement : ${dateCourte(projet.dateFinInitiale)}` }] : []),
        ...(projet.dateFinPrevue ? [{ date: projet.dateFinPrevue, type: "fin" as const, titre: `Fin prévue : ${dateCourte(projet.dateFinPrevue)}` }] : []),
        ...(projet.dateLancementPrevue ? [{ date: projet.dateLancementPrevue, type: "lancement" as const, titre: `Lancement prévu : ${dateCourte(projet.dateLancementPrevue)}` }] : []),
      ],
    },
  ];

  // Une section par personne, ses tâches dans l'ordre de début.
  const parPersonne = new Map<string, typeof datees>();
  for (const p of datees) parPersonne.set(p.t.assigneId, [...(parPersonne.get(p.t.assigneId) ?? []), p]);
  const personnes = [...parPersonne.entries()].sort((x, y) => x[1][0].t.personne.localeCompare(y[1][0].t.personne, "fr"));
  for (const [pid, liste] of personnes) {
    const ouvertes = liste.filter((p) => p.t.statut !== "faite");
    const heures = ouvertes.reduce((s, p) => s + heuresDe(p.t), 0);
    lignes.push({
      id: `p-${pid}`,
      libelle: liste[0].t.personne,
      mono: liste[0].t.initiales,
      groupe: true,
      barres: [],
      sous: `${ouvertes.length} tâche${ouvertes.length > 1 ? "s" : ""} ouverte${ouvertes.length > 1 ? "s" : ""} · ${heuresTexte(heures)}`,
    });
    for (const p of liste.sort((x, y) => x.debut.localeCompare(y.debut))) {
      const t = p.t;
      const etat = t.retard ? "En retard" : LIBELLE_STATUT[t.statut];
      const titre = `${t.titre} — ${t.personne} — du ${dateCourte(p.debut)} au ${dateCourte(p.fin)} — ${etat}${t.estimationHeures ? ` — ${t.estimationHeures} h` : ""}`;
      lignes.push({
        id: t.id,
        libelle: t.titre,
        lien: t.ouvrable ? `/taches/${t.id}?retour=${retour}` : undefined,
        barres: [
          {
            debut: p.debut,
            fin: p.fin,
            classe: `gantt__barre--${t.retard ? "retard" : t.statut}`,
            texte: t.estimationHeures ? `${t.estimationHeures} h` : undefined,
            titre,
            lien: t.ouvrable ? `/taches/${t.id}?retour=${retour}` : undefined,
          },
        ],
      });
    }
  }
  const sansDate = periodes.filter((p) => !p.debut || !p.fin).map((p) => p.t);

  return (
    <>
      <EnTeteVue ctx={ctx} vue="gantt" />
      <div className="page">
        <div className="ligne-actions">
          <nav className="zoom" aria-label="Échelle">
            {(["jour", "semaine", "mois"] as Zoom[]).map((zz) => (
              <a key={zz} href={`/projets/${id}/gantt${zz === "semaine" ? "" : `?zoom=${zz}`}`} aria-current={zoom === zz ? "true" : undefined}>
                {LIBELLE_ZOOM[zz]}
              </a>
            ))}
          </nav>
          <div className="legende">
            <span>
              <i /> À faire
            </span>
            <span>
              <i style={{ background: "var(--arc)" }} /> En cours
            </span>
            <span>
              <i style={{ background: "var(--retard-point)", borderColor: "var(--retard-point)" }} /> En retard
            </span>
            <span>
              <i style={{ background: "var(--veille-point)", borderColor: "var(--veille-point)" }} /> Bloquée
            </span>
            <span>
              <i style={{ background: "var(--piste)", borderColor: "transparent" }} /> Faite
            </span>
            <span>
              <i style={{ width: 2, height: 14, border: 0, background: "#f4b22d" }} /> Aujourd&apos;hui
            </span>
          </div>
        </div>
        {datees.length ? (
          <Gantt id="gantt-projet" lignes={lignes} debut={debut} fin={fin} zoom={zoom} aujourdhui={jour} finProjet={projet.dateFinPrevue} />
        ) : (
          <p className="vide">Aucune tâche datée sur ce projet. Ajoutez une échéance ou un début aux tâches pour les voir ici.</p>
        )}
        {sansDate.length ? (
          <section className="carte carte--liste" aria-labelledby="g-sans-date">
            <h2 id="g-sans-date" className="carte__titre">
              Sans date · {sansDate.length}
            </h2>
            <ul className="liste">
              {sansDate.map((t) => (
                <li key={t.id} className="rangee">
                  <span className="mono mono--petit" aria-hidden="true">
                    {t.initiales}
                  </span>
                  <span className="rangee__texte">
                    {t.ouvrable ? (
                      <a href={`/taches/${t.id}?retour=${retour}`} className="rangee__titre" style={{ color: "inherit" }}>
                        {t.titre}
                      </a>
                    ) : (
                      <span className="rangee__titre">{t.titre}</span>
                    )}
                  </span>
                  <span className="rangee__meta">{LIBELLE_STATUT[t.statut]}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
