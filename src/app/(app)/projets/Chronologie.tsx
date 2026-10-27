import { ajouterJours, aujourdhui, dateCourte, ecartJours } from "@/lib/dates";
import { Gantt, type BarreGantt, type LigneGantt } from "@/components/Gantt";

type ProjetChrono = {
  id: string;
  code: string;
  titre: string;
  strategique: boolean;
  sante: "dans_les_temps" | "a_surveiller" | "en_retard";
  dateEntree: string | null;
  dateFinInitiale: string | null;
  dateFinPrevue: string | null;
  dateLancementPrevue: string | null;
  ancienneFin: string | null;
};

/** Chronologie du portefeuille : un projet par ligne, de son entrée à sa fin prévue, avec le retard pris sur la fin initiale. */
export function Chronologie({ projets }: { projets: ProjetChrono[] }) {
  const jour = aujourdhui();
  const tries = [...projets].sort((a, b) => (a.dateFinPrevue ?? "9999").localeCompare(b.dateFinPrevue ?? "9999"));
  // Fenêtre : au plus un an en arrière, jusqu'au dernier lancement prévu.
  const fins = tries.flatMap((p) => [p.dateFinPrevue, p.dateLancementPrevue]).filter(Boolean) as string[];
  const debuts = tries.map((p) => p.dateEntree).filter(Boolean) as string[];
  const unAn = ajouterJours(jour, -365);
  const debut = ajouterJours(debuts.length ? debuts.reduce((a, b) => (a < b ? a : b)) : unAn, -14);
  const debutBorne = debut < unAn ? unAn : debut;
  const fin = ajouterJours(fins.length ? fins.reduce((a, b) => (a > b ? a : b)) : ajouterJours(jour, 180), 45);

  const lignes: LigneGantt[] = tries.map((p) => {
    const barres: BarreGantt[] = [];
    const entree = p.dateEntree ?? debutBorne;
    if (p.dateFinPrevue) {
      const initiale = p.dateFinInitiale && p.dateFinInitiale < p.dateFinPrevue ? p.dateFinInitiale : p.dateFinPrevue;
      barres.push({ debut: entree, fin: initiale, classe: "gantt__barre--projet", titre: `${p.titre} : du ${dateCourte(entree)} au ${dateCourte(p.dateFinPrevue)}` });
      if (initiale < p.dateFinPrevue)
        barres.push({
          debut: ajouterJours(initiale, 1),
          fin: p.dateFinPrevue,
          classe: "gantt__barre--prolongee",
          titre: `Retard sur la fin initiale (${dateCourte(initiale)}) : ${Math.round(ecartJours(initiale, p.dateFinPrevue) / 7)} semaines`,
        });
    } else {
      barres.push({ debut: entree, fin, classe: "gantt__barre--projet", titre: `${p.titre} : activité continue` });
    }
    return {
      id: p.id,
      libelle: `${p.code} · ${p.titre}`,
      lien: `/projets/${p.id}/gantt`,
      barres,
      jalons: [
        ...(p.dateFinInitiale && p.dateFinInitiale !== p.dateFinPrevue ? [{ date: p.dateFinInitiale, type: "initial" as const, titre: `Fin prévue initialement : ${dateCourte(p.dateFinInitiale)}` }] : []),
        ...(p.dateFinPrevue ? [{ date: p.dateFinPrevue, type: "fin" as const, titre: `Fin prévue : ${dateCourte(p.dateFinPrevue)}` }] : []),
        ...(p.dateLancementPrevue ? [{ date: p.dateLancementPrevue, type: "lancement" as const, titre: `Lancement prévu : ${dateCourte(p.dateLancementPrevue)}` }] : []),
      ],
    };
  });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Chronologie des projets">
      <div className="legende">
        <span>
          <i style={{ border: 0, background: "var(--arc-2)" }} /> Durée prévue initialement
        </span>
        <span>
          <i style={{ border: 0, background: "repeating-linear-gradient(135deg, var(--retard-point) 0 4px, transparent 4px 8px)" }} /> Retard sur la fin initiale
        </span>
        <span>
          <i style={{ width: 10, height: 10, border: "1.5px solid var(--controle)", transform: "rotate(45deg)" }} /> Fin initiale
        </span>
        <span>
          <i style={{ width: 10, height: 10, border: 0, background: "var(--encre)", transform: "rotate(45deg)" }} /> Fin prévue
        </span>
        <span>
          <i style={{ width: 10, height: 10, border: 0, background: "#f4b22d", transform: "rotate(45deg)" }} /> Lancement
        </span>
      </div>
      <Gantt id="chronologie" lignes={lignes} debut={debutBorne} fin={fin} zoom="mois" aujourdhui={jour} />
    </section>
  );
}
