/**
 * Comparer deux rapports au conseil (demandé le 29 octobre 2026) : les projets de l'un et de l'autre alignés, avec ce
 * qui a changé entre les deux (fin prévue, lancement, état d'avancement, projet ajouté ou retiré). Pur, testé dans
 * tests/comparaison-conseil.test.ts.
 */

export type LigneComparable = {
  projetId: string;
  code: string;
  titre: string;
  programme: string;
  ordre: number;
  etat: string;
  /** Nouvelle date de fin prévue (celle du rapport). */
  fin: string | null;
  lancement: string | null;
};

export type LigneComparee = {
  projetId: string;
  code: string;
  titre: string;
  programme: string;
  a: LigneComparable | null;
  b: LigneComparable | null;
  /** Fin prévue différente entre A et B ; écart en jours (positif : repoussée dans B). */
  finChangee: boolean;
  ecartFinJours: number | null;
  lancementChange: boolean;
  etatChange: boolean;
};

export type Comparaison = {
  lignes: LigneComparee[];
  communs: number;
  seulementA: number;
  seulementB: number;
  finsRepoussees: number;
  finsAvancees: number;
  lancementsChanges: number;
  etatsChanges: number;
};

const jours = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);
const memeTexte = (x: string, y: string) => x.replace(/\s+/g, " ").trim() === y.replace(/\s+/g, " ").trim();

/** Les projets des deux rapports, dans l'ordre du rapport B, puis ceux qui ne sont que dans A. */
export function comparerRapports(a: LigneComparable[], b: LigneComparable[]): Comparaison {
  const parA = new Map(a.map((l) => [l.projetId, l]));
  const parB = new Map(b.map((l) => [l.projetId, l]));
  const ordre = [...[...b].sort((x, y) => x.ordre - y.ordre).map((l) => l.projetId), ...[...a].sort((x, y) => x.ordre - y.ordre).map((l) => l.projetId).filter((id) => !parB.has(id))];
  const lignes: LigneComparee[] = ordre.map((id) => {
    const la = parA.get(id) ?? null;
    const lb = parB.get(id) ?? null;
    const ref = (lb ?? la)!;
    const deux = !!la && !!lb;
    const finChangee = deux && (la!.fin ?? "") !== (lb!.fin ?? "");
    return {
      projetId: id,
      code: ref.code,
      titre: ref.titre,
      programme: ref.programme,
      a: la,
      b: lb,
      finChangee,
      ecartFinJours: finChangee && la!.fin && lb!.fin ? jours(la!.fin, lb!.fin) : null,
      lancementChange: deux && (la!.lancement ?? "") !== (lb!.lancement ?? ""),
      etatChange: deux && !memeTexte(la!.etat, lb!.etat),
    };
  });
  return {
    lignes,
    communs: lignes.filter((l) => l.a && l.b).length,
    seulementA: lignes.filter((l) => l.a && !l.b).length,
    seulementB: lignes.filter((l) => !l.a && l.b).length,
    finsRepoussees: lignes.filter((l) => (l.ecartFinJours ?? 0) > 0).length,
    finsAvancees: lignes.filter((l) => (l.ecartFinJours ?? 0) < 0).length,
    lancementsChanges: lignes.filter((l) => l.lancementChange).length,
    etatsChanges: lignes.filter((l) => l.etatChange).length,
  };
}

/** « +3 sem. », « −5 j », « +2 mois » : l'écart d'une date, lisible. */
export function ecartTexte(j: number): string {
  const signe = j > 0 ? "+" : "−";
  const n = Math.abs(j);
  if (n >= 60) return `${signe}${Math.round(n / 30)} mois`;
  if (n >= 14) return `${signe}${Math.round(n / 7)} sem.`;
  return `${signe}${n} j`;
}
