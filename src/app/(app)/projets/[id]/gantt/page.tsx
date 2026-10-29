import type { Metadata } from "next";
import { ajouterJours, aujourdhui, dateCourte, dateLocale, ecartJours } from "@/lib/dates";
import { debutPrevu, heuresDe, heuresTexte } from "@/lib/charge";
import { Gantt, LIBELLE_ZOOM, type BarreGantt, type LigneGantt, type Zoom } from "@/components/Gantt";
import { chargerVueProjet, cheminVue, EnTeteVue, LIBELLE_STATUT } from "../commun";
import { livrablesDuProjet } from "@/lib/donnees/livrables";
import { attentesDuProjet } from "@/lib/donnees/dependances";
import { phasesDuProjet } from "@/lib/donnees/risques";
import { phaseDepassee, phaseEnCours } from "@/lib/risques";

export const metadata: Metadata = { title: "Gantt du projet" };

export default async function PageGantt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ zoom?: string; par?: string }> }) {
  const { id } = await params;
  const { zoom: z, par } = await searchParams;
  const zoom: Zoom = z === "jour" || z === "mois" ? z : "semaine";
  const ctx = await chargerVueProjet(id);
  const { projet, taches } = ctx;
  const jour = aujourdhui();
  const [{ livrables }, attentes, phases] = await Promise.all([livrablesDuProjet(id, jour), attentesDuProjet(id), phasesDuProjet(id)]);
  // Phases datées : du début saisi (ou du lendemain de la phase précédente) à la fin prévue (ou au jour où elle a été terminée).
  const courante = phaseEnCours(phases, jour);
  const phasesDatees: { id: string; nom: string; debut: string; fin: string; etat: "terminee" | "depassee" | "en-cours" | "a-venir" }[] = [];
  for (const ph of phases) {
    const precedente = phasesDatees[phasesDatees.length - 1];
    const fin = ph.fin ?? ph.termineeLe ?? null;
    const deb = ph.debut ?? (precedente ? ajouterJours(precedente.fin, 1) : null);
    if (!deb || !fin || deb > fin) continue;
    phasesDatees.push({ id: ph.id, nom: ph.nom, debut: deb, fin, etat: ph.termineeLe ? "terminee" : phaseDepassee(ph, jour) ? "depassee" : ph.id === courante?.id ? "en-cours" : "a-venir" });
  }
  // Par livrable quand le projet en a (le plan du projet), sinon par personne.
  const parLivrable = livrables.length > 0 && par !== "personne";
  const lienVue = (zz: Zoom, pp: "livrable" | "personne") => {
    const q = new URLSearchParams();
    if (zz !== "semaine") q.set("zoom", zz);
    if (pp === "personne" && livrables.length) q.set("par", "personne");
    return `/projets/${id}/gantt${q.size ? `?${q}` : ""}`;
  };
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
  const dates = [jour, ...datees.flatMap((p) => [p.debut, p.fin]), ...(parLivrable ? livrables.filter((l) => l.prevuLe).map((l) => l.prevuLe!) : []), ...(zoom === "mois" ? phasesDatees.flatMap((ph) => [ph.debut, ph.fin]) : phasesDatees.filter((ph) => ph.etat !== "terminee").map((ph) => ph.fin))];
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

  if (phasesDatees.length) {
    const LIB = { terminee: "terminée", depassee: "fin dépassée", "en-cours": "en cours", "a-venir": "à venir" } as const;
    lignes.push({
      id: "phases",
      libelle: "Phases",
      sous: courante ? `${courante.nom} en cours` : "toutes terminées",
      lien: `/projets/${id}#phases`,
      // Plages ramenées à la fenêtre affichée, pour que le nom de la phase reste lisible.
      barres: phasesDatees.filter((ph) => ph.fin >= debut && ph.debut <= fin).map((ph) => ({
        debut: ph.debut < debut ? debut : ph.debut,
        fin: ph.fin > fin ? fin : ph.fin,
        classe: `gantt__barre--phase gantt__barre--phase-${ph.etat}`,
        texte: ph.nom,
        titre: `Phase « ${ph.nom} » : du ${dateCourte(ph.debut)} au ${dateCourte(ph.fin)} — ${LIB[ph.etat]}`,
      })),
    });
  }

  const ligneTache = (p: (typeof datees)[number], avecPersonne: boolean, prevuLivrable: string | null = null): LigneGantt => {
    const t = p.t;
    const apres = !!prevuLivrable && t.statut !== "faite" && p.fin > prevuLivrable;
    const etat = t.retard ? "En retard" : LIBELLE_STATUT[t.statut];
    const titre = `${t.titre} — ${t.personne} — du ${dateCourte(p.debut)} au ${dateCourte(p.fin)} — ${etat}${t.estimationHeures ? ` — ${t.estimationHeures} h` : ""}${apres ? " — après la date du livrable" : ""}`;
    // Ce que la tâche attend encore (dépendances) : la première, et combien d'autres.
    const att = t.statut !== "faite" ? attentes.get(t.id) : undefined;
    const attend = att?.length ? `attend « ${att[0].titre} »${att.length > 1 ? ` et ${att.length - 1} autre${att.length > 2 ? "s" : ""}` : ""}` : null;
    const sous = [avecPersonne ? t.personne : null, apres ? "après la date du livrable" : null, attend].filter(Boolean).join(" · ");
    return {
      id: t.id,
      libelle: t.titre,
      sous: sous || undefined,
      lien: t.ouvrable ? `/taches/${t.id}?retour=${retour}` : undefined,
      barres: [
        {
          debut: p.debut,
          fin: p.fin,
          classe: `gantt__barre--${t.retard ? "retard" : t.statut}${apres ? " gantt__barre--apres" : ""}`,
          texte: t.estimationHeures ? `${t.estimationHeures} h` : undefined,
          titre,
          lien: t.ouvrable ? `/taches/${t.id}?retour=${retour}` : undefined,
        },
      ],
    };
  };

  if (parLivrable) {
    // Une section par livrable : ses tâches, sa date (losange), du début de sa première tâche à la fin de la dernière.
    const groupes = [...livrables.map((l) => ({ l, liste: datees.filter((p) => p.t.livrableId === l.id) })), { l: null, liste: datees.filter((p) => !p.t.livrableId) }];
    for (const { l, liste } of groupes) {
      // Sans tâche datée : seulement un livrable à venir qui a une date (son losange) ; un livrable validé sans tâche n'apporte rien ici.
      if (!liste.length && (!l || !l.prevuLe || l.etat === "atteint")) continue;
      const tri = [...liste].sort((x, y) => x.debut.localeCompare(y.debut));
      const deb = tri.length ? tri.reduce((m, p) => (p.debut < m ? p.debut : m), tri[0].debut) : null;
      const fn = tri.length ? tri.reduce((m, p) => (p.fin > m ? p.fin : m), tri[0].fin) : null;
      lignes.push({
        id: l ? `l-${l.id}` : "hors-livrable",
        libelle: l ? l.libelle : "Hors livrable",
        sous: l
          ? [l.responsable ?? "sans responsable", `${l.compte.faites}/${l.compte.total} tâche${l.compte.total > 1 ? "s" : ""}`, l.prevuLe ? `prévu le ${dateCourte(l.prevuLe)}` : "sans date", l.affiche === "atteint" ? "validé" : l.affiche === "pret" ? "prêt à valider" : null]
              .filter(Boolean)
              .join(" · ")
          : `${liste.length} tâche${liste.length > 1 ? "s" : ""} datée${liste.length > 1 ? "s" : ""}`,
        groupe: true,
        lien: l ? `/projets/${id}/livrables/${l.id}` : undefined,
        barres: deb && fn ? [{ debut: deb, fin: fn, classe: `gantt__barre--livrable${l && l.prevuLe && fn > l.prevuLe && l.etat !== "atteint" ? " gantt__barre--livrable-depasse" : ""}`, titre: `${l ? l.libelle : "Hors livrable"} : du ${dateCourte(deb)} au ${dateCourte(fn)}` }] : [],
        jalons:
          l && l.prevuLe
            ? [{ date: l.prevuLe, type: l.etat === "atteint" ? "livrable-valide" : l.enRetard ? "livrable-retard" : "livrable", titre: `${l.libelle} : prévu le ${dateCourte(l.prevuLe)}${l.etat === "atteint" ? ", validé" : l.enRetard ? ", en retard" : ""}` }]
            : undefined,
      });
      for (const p of tri) lignes.push(ligneTache(p, true, l?.prevuLe ?? null));
    }
  }

  // Une section par personne, ses tâches dans l'ordre de début.
  const parPersonne = new Map<string, typeof datees>();
  for (const p of datees) parPersonne.set(p.t.assigneId, [...(parPersonne.get(p.t.assigneId) ?? []), p]);
  const personnes = [...parPersonne.entries()].sort((x, y) => x[1][0].t.personne.localeCompare(y[1][0].t.personne, "fr"));
  for (const [pid, liste] of parLivrable ? [] : personnes) {
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
    for (const p of liste.sort((x, y) => x.debut.localeCompare(y.debut))) lignes.push(ligneTache(p, false));
  }
  const sansDate = periodes.filter((p) => !p.debut || !p.fin).map((p) => p.t);

  return (
    <>
      <EnTeteVue ctx={ctx} vue="gantt" />
      <div className="page">
        <div className="ligne-actions">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {livrables.length ? (
              <nav className="zoom" aria-label="Regrouper les tâches">
                <a href={lienVue(zoom, "livrable")} aria-current={parLivrable ? "true" : undefined}>
                  Par livrable
                </a>
                <a href={lienVue(zoom, "personne")} aria-current={!parLivrable ? "true" : undefined}>
                  Par personne
                </a>
              </nav>
            ) : null}
            <nav className="zoom" aria-label="Échelle">
              {(["jour", "semaine", "mois"] as Zoom[]).map((zz) => (
                <a key={zz} href={lienVue(zz, parLivrable ? "livrable" : "personne")} aria-current={zoom === zz ? "true" : undefined}>
                  {LIBELLE_ZOOM[zz]}
                </a>
              ))}
            </nav>
          </div>
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
            {parLivrable ? (
              <span>
                <i className="gantt__cle-livrable" /> Date du livrable
              </span>
            ) : null}
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
