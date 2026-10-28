/**
 * La barre comprend ce qu'on écrit : ce module décide de quoi parle une ligne (tâche, réunion, note pour le
 * rapport, mise à jour d'un projet, question) et reconnaît les mots qui remplacent les touches
 * (« pour Fabienne » = @, « projet Unibank » = /, « avec Fabienne et Daphnée »). Pur (sans base) : il sert à
 * l'aperçu dans la page et, à nouveau, au serveur. Testé dans tests/barre.test.ts.
 */
import { cleNom } from "@/lib/projets";
import { analyserMiseAJour, estReunion, extraireCodeProjet, extraireEcheance, extraireHeures, nettoyer, type ProjetSaisie } from "@/lib/saisie-rapide";
import { ajouterJours, jourComplet, lundiDe } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Notes pour le rapport du vendredi : « Décision : … », « Risque : … », « Fait marquant : … »
// ---------------------------------------------------------------------------

export type RubriqueNote = "decision" | "bloque" | "fait" | "prochaine";
export const LIBELLES_NOTE: Record<RubriqueNote, string> = { decision: "Décision ou aide attendue", bloque: "Risque ou blocage", fait: "Fait marquant", prochaine: "La semaine prochaine" };

// Le deux-points est obligatoire : « Fait le point avec la DTI » reste une tâche.
const NOTES: [RegExp, RubriqueNote][] = [
  [/^\s*(?:d[ée]cision(?:\s+attendue)?|aide\s+attendue|[àa]\s+d[ée]cider|besoin)\s*:\s*/i, "decision"],
  [/^\s*(?:risque|alerte|blocage|point\s+d['’]attention)\s*:\s*/i, "bloque"],
  [/^\s*(?:fait\s+marquant|r[ée]ussite|succ[èe]s|fait)\s*:\s*/i, "fait"],
  [/^\s*(?:(?:la\s+)?semaine\s+prochaine|[àa]\s+venir|prochaine\s+[ée]tape)\s*:\s*/i, "prochaine"],
];

export function rubriqueDeNote(saisie: string): RubriqueNote | null {
  return NOTES.find(([m]) => m.test(saisie))?.[1] ?? null;
}

export type AnalyseNote = { rubrique: RubriqueNote; texte: string; projet: ProjetSaisie | null };

export function analyserNote(saisie: string, projets: ProjetSaisie[]): AnalyseNote | null {
  const n = NOTES.find(([m]) => m.test(saisie));
  if (!n) return null;
  let texte = saisie.replace(n[0], "").replace(/\s+/g, " ").trim();
  // Un code de projet écrit tel quel (« UR »), comme pour une tâche.
  let projet: ProjetSaisie | null = null;
  const parCode = new Map(projets.map((p) => [p.code.toUpperCase(), p]));
  const codes = /(?:^|\s)([A-Z0-9]{2,4})(?=$|[\s,.;:!?])/g;
  for (let m = codes.exec(texte); m; m = codes.exec(texte)) {
    if (/[A-Z]/.test(m[1]) && parCode.has(m[1])) {
      projet = parCode.get(m[1])!;
      texte = `${texte.slice(0, m.index)} ${texte.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
      break;
    }
  }
  texte = texte.replace(/^[-–—,:;]\s*/, "").slice(0, 1000);
  return { rubrique: n[1], texte: texte.charAt(0).toUpperCase() + texte.slice(1), projet };
}

// ---------------------------------------------------------------------------
// Mettre à jour un projet : « /UR à surveiller : retard du prestataire », « /UR jalon recette 15/11 »
// ---------------------------------------------------------------------------

export type SanteProjet = "dans_les_temps" | "a_surveiller" | "en_retard";
export const LIBELLES_SANTE: Record<SanteProjet, string> = { dans_les_temps: "Dans les temps", a_surveiller: "À surveiller", en_retard: "En retard" };

export type MajProjet =
  | { genre: "sante"; sante: SanteProjet; motif: string }
  | { genre: "jalon"; libelle: string; prevuLe: string | null }
  | { genre: "fin"; date: string }
  | { genre: "lancement"; date: string };

/** Date d'un jalon ou d'une fin prévue : 15/11, 15/11/2027, « 15 novembre », « fin du mois », « vendredi ». */
function dateFuture(texte: string, aujourdhui: string): { date: string | null; reste: string } {
  const a = analyserMiseAJour(texte, aujourdhui);
  // analyserMiseAJour reconnaît les mêmes dates qu'une tâche (prochaine occurrence) ; le reste est la note.
  return { date: a.echeance, reste: a.note };
}

export function analyserMajProjet(texte: string, aujourdhui: string): MajProjet | null {
  const t = texte.replace(/\s+/g, " ").trim();
  const sante = /^(dans\s+les\s+temps|[àa]\s+surveiller|en\s+retard)(?=$|[\s:,.;!–—-])[\s:,.;!–—-]*(.*)$/i.exec(t);
  if (sante) {
    const s: SanteProjet = /temps/i.test(sante[1]) ? "dans_les_temps" : /surveiller/i.test(sante[1]) ? "a_surveiller" : "en_retard";
    const motif = sante[2].replace(/^(?:car|parce\s+que|:)\s*/i, "").trim().slice(0, 500);
    return { genre: "sante", sante: s, motif: motif ? motif.charAt(0).toUpperCase() + motif.slice(1) : "" };
  }
  const jalon = /^jalon(?=$|[\s:,–—-])[\s:,–—-]*(.*)$/i.exec(t);
  if (jalon) {
    const d = dateFuture(` ${jalon[1]} `, aujourdhui);
    const libelle = d.reste.trim().slice(0, 200);
    return { genre: "jalon", libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1), prevuLe: d.date };
  }
  const fin = /^fin(?:\s+pr[ée]vue)?(?=$|[\s:,–—-])[\s:,–—-]*(.*)$/i.exec(t);
  if (fin) {
    const d = dateFuture(` ${fin[1]} `, aujourdhui);
    return d.date ? { genre: "fin", date: d.date } : null;
  }
  const lancement = /^lancement(?:\s+pr[ée]vu)?(?=$|[\s:,–—-])[\s:,–—-]*(.*)$/i.exec(t);
  if (lancement) {
    const d = dateFuture(` ${lancement[1]} `, aujourdhui);
    return d.date ? { genre: "lancement", date: d.date } : null;
  }
  return null;
}

export function texteMajProjet(m: MajProjet): string {
  if (m.genre === "sante") return `${LIBELLES_SANTE[m.sante]}${m.motif ? ` : ${m.motif}` : ""}`;
  if (m.genre === "jalon") return `Jalon : ${m.libelle || "(sans libellé)"}${m.prevuLe ? `, prévu ${jourComplet(m.prevuLe).toLowerCase()}` : ""}`;
  if (m.genre === "fin") return `Fin prévue : ${jourComplet(m.date).toLowerCase()}`;
  return `Lancement prévu : ${jourComplet(m.date).toLowerCase()}`;
}

/** « UR à surveiller : … » sans « / » : le code du projet en tête, suivi d'une mise à jour reconnue. */
export function projetEnTete(saisie: string, projets: ProjetSaisie[], aujourdhui: string): { projet: ProjetSaisie; reste: string } | null {
  const m = /^\s*([A-Z0-9]{2,4})\s+(.+)$/.exec(saisie);
  if (!m || !/[A-Z]/.test(m[1])) return null;
  const projet = projets.find((p) => p.code.toUpperCase() === m[1]);
  return projet && analyserMajProjet(m[2], aujourdhui) ? { projet, reste: m[2] } : null;
}

// ---------------------------------------------------------------------------
// Questions : « en retard sur UR ? », « qui est surchargé ? », « mes échéances de la semaine ? »
// ---------------------------------------------------------------------------

export const estQuestion = (saisie: string) => /\?\s*$/.test(saisie) || /^\s*\?/.test(saisie);

export type Sujet = "retard" | "bloquees" | "echeances" | "charge" | "rapports" | "reunions" | "projets" | "equipe_projet";
export type Periode = { debut: string; fin: string; libelle: string };
export type AnalyseQuestion = { sujet: Sujet | null; miennes: boolean; periode: Periode; projetCode: string | null; motsPersonne: string | null };

export function periodeDe(q: string, aujourdhui: string, defaut: "semaine" | "jour" = "semaine"): Periode {
  const lundi = lundiDe(aujourdhui);
  if (/aujourd['’]?hui|ce\s+jour|du\s+jour/i.test(q)) return { debut: aujourdhui, fin: aujourdhui, libelle: "aujourd'hui" };
  if (/demain/i.test(q)) return { debut: ajouterJours(aujourdhui, 1), fin: ajouterJours(aujourdhui, 1), libelle: "demain" };
  if (/semaine\s+prochaine|la\s+semaine\s+qui\s+vient/i.test(q)) return { debut: ajouterJours(lundi, 7), fin: ajouterJours(lundi, 13), libelle: "la semaine prochaine" };
  if (/semaine\s+derni[èe]re|semaine\s+pass[ée]e/i.test(q)) return { debut: ajouterJours(lundi, -7), fin: ajouterJours(lundi, -1), libelle: "la semaine dernière" };
  if (/(ce|du)\s+mois/i.test(q)) {
    const debut = `${aujourdhui.slice(0, 8)}01`;
    const d = new Date(`${debut}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(0);
    return { debut, fin: d.toISOString().slice(0, 10), libelle: "ce mois-ci" };
  }
  if (defaut === "jour") return { debut: aujourdhui, fin: aujourdhui, libelle: "aujourd'hui" };
  return { debut: lundi, fin: ajouterJours(lundi, 6), libelle: "cette semaine" };
}

export function analyserQuestion(saisie: string, aujourdhui: string): AnalyseQuestion {
  const q = saisie.replace(/^\s*\?\s*/, "").replace(/\?\s*$/, "").trim();
  const c = cleNom(q);
  const sujet: Sujet | null = /surcharg|\bcharge\b|charges?\s|qui est (dispo|libre)|disponib|trop de travail/.test(c)
    ? "charge"
    : /rapport|pas envoye|n a pas envoye|manquant/.test(c)
      ? "rapports"
      : /bloque/.test(c)
        ? "bloquees"
        : /(projet|projets).*(surveiller|retard|risque|sante)|(surveiller|risque|sante).*(projet|projets)|projets? en retard/.test(c)
          ? "projets"
          : /retard/.test(c)
            ? "retard"
            : /echeance|a rendre|\bdues?\b|a faire|a livrer/.test(c)
              ? "echeances"
              : /reunion/.test(c)
                ? "reunions"
                : /qui travaille|equipe (du|de) projet|membres/.test(c)
                  ? "equipe_projet"
                  : null;
  const miennes = /\b(mes|mon|ma|moi|je|j ai)\b/.test(c);
  const code = /(?:^|\s)([A-Z0-9]{2,4})(?=$|[\s,.;:!?])/.exec(q.replace(/\bJE\b/g, ""))?.[1] ?? null;
  // « … de Fabienne », « … pour Myriam » : le nom est retrouvé par la page ou le serveur dans les personnes visibles.
  const pers = /\b(?:de|d'|d’|pour|chez)\s*([A-ZÀ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-Ý][\p{L}'’-]+)?)/u.exec(q);
  return { sujet, miennes, periode: periodeDe(q, aujourdhui, sujet === "reunions" ? "semaine" : "semaine"), projetCode: code && /[A-Z]/.test(code) ? code : null, motsPersonne: pers?.[1] ?? null };
}

// ---------------------------------------------------------------------------
// Des mots à la place des touches : « pour Fabienne », « projet Unibank », « avec Fabienne et Daphnée »
// ---------------------------------------------------------------------------

export type Nomme = { id: string; nom: string };

/** La personne que désignent ces mots (prénom, nom, ou les deux), si elle est la seule. */
export function personneNommee<T extends Nomme>(mots: string, personnes: T[], moiId?: string): T | null {
  const c = cleNom(mots);
  if (!c) return null;
  if (moiId && /^(moi|moi meme)$/.test(c)) return personnes.find((p) => p.id === moiId) ?? null;
  const exacts = personnes.filter((p) => {
    const n = cleNom(p.nom);
    const parties = n.split(" ");
    return n === c || parties.includes(c) || (c.includes(" ") && n.startsWith(c));
  });
  return exacts.length === 1 ? exacts[0] : null;
}

/** Le projet que désignent ces mots (code, ou mots du titre), s'il est le seul. */
export function projetNomme(mots: string, projets: ProjetSaisie[]): ProjetSaisie | null {
  const c = cleNom(mots);
  if (!c) return null;
  const parCode = projets.filter((p) => cleNom(p.code) === c);
  if (parCode.length === 1) return parCode[0];
  const parTitre = projets.filter((p) => ` ${cleNom(p.titre)} `.includes(` ${c} `) || cleNom(p.titre).startsWith(c));
  return parTitre.length === 1 ? parTitre[0] : null;
}

export type MotsReconnus<P extends Nomme> = { texte: string; personne: P | null; invites: P[]; projet: ProjetSaisie | null; trouves: string[] };

const MOT = "[\\p{L}][\\p{L}'’-]*";

/**
 * Retire du texte les mots qui désignent une personne ou un projet et les rend à part.
 * - tâche : « pour Fabienne » (ou « confier à Fabienne ») ;
 * - réunion : « avec Fabienne, Daphnée et Myriam » ;
 * - partout : « projet Unibank », « sur le projet Credos », « pour le projet UR ».
 * Rien n'est retiré si les mots ne désignent personne de façon sûre (« pour vendredi » reste une date).
 */
export function reconnaitreMots<P extends Nomme>(saisie: string, o: { personnes: P[]; projets: ProjetSaisie[]; reunion?: boolean; moiId?: string }): MotsReconnus<P> {
  let texte = ` ${saisie} `;
  const trouves: string[] = [];
  let projet: ProjetSaisie | null = null;
  let personne: P | null = null;
  const invites: P[] = [];

  // Projet : jusqu'à quatre mots après « projet », le plus long qui désigne un seul projet.
  const rp = new RegExp(`(\\s)(?:(?:sur|pour|du|dans)\\s+(?:le\\s+)?)?projet\\s+((?:${MOT}\\s*){1,4})`, "iu").exec(texte);
  if (rp) {
    const mots = rp[2].trim().split(/\s+/);
    for (let n = Math.min(4, mots.length); n >= 1 && !projet; n--) {
      const p = projetNomme(mots.slice(0, n).join(" "), o.projets);
      if (p) {
        projet = p;
        const fin = rp.index + rp[1].length + rp[0].slice(rp[1].length).indexOf(mots[n - 1]) + mots[n - 1].length;
        trouves.push(texte.slice(rp.index + rp[1].length, fin).trim());
        texte = `${texte.slice(0, rp.index)} ${texte.slice(fin)}`;
      }
    }
  }

  if (o.reunion) {
    // « avec A, B et C » : des noms séparés par des virgules ou « et » ; on s'arrête au premier mot qui n'en est pas un.
    const ra = /(\s)avec\s+/iu.exec(texte);
    if (ra) {
      const debut = ra.index + ra[0].length;
      const jetons = [...texte.slice(debut).matchAll(/[\p{L}][\p{L}'’-]*|,/gu)].map((j) => ({ t: j[0], fin: debut + j.index! + j[0].length }));
      const reconnus: P[] = [];
      let i = 0;
      let fin = debut;
      let attendNom = true;
      while (i < jetons.length) {
        const j = jetons[i];
        if (!attendNom && (j.t === "," || /^et$/i.test(j.t))) {
          attendNom = true;
          i += 1;
          continue;
        }
        if (!attendNom) break;
        const deux = jetons[i + 1] && jetons[i + 1].t !== "," ? personneNommee(`${j.t} ${jetons[i + 1].t}`, o.personnes) : null;
        const p = deux ?? personneNommee(j.t, o.personnes);
        if (!p) break;
        if (!reconnus.some((x) => x.id === p.id)) reconnus.push(p);
        i += deux ? 2 : 1;
        fin = jetons[i - 1].fin;
        attendNom = false;
      }
      // Tous les noms annoncés doivent être reconnus : « avec Fabienne et Pierre » ne retire rien.
      if (reconnus.length && !attendNom) {
        invites.push(...reconnus);
        trouves.push(texte.slice(ra.index + ra[1].length, fin).trim());
        texte = `${texte.slice(0, ra.index)} ${texte.slice(fin)}`;
      }
    }
  } else {
    // « pour Fabienne », « confier à Fabienne » (« pour vendredi » n'est pas une personne).
    const rx = new RegExp(`(\\s)(?:pour|confier\\s+[àa]|confi[ée]e?\\s+[àa])\\s+(${MOT}(?:\\s+${MOT})?)`, "giu");
    for (let m = rx.exec(texte); m && !personne; m = rx.exec(texte)) {
      const mots = m[2].split(/\s+/);
      for (let n = mots.length; n >= 1 && !personne; n--) {
        const p = personneNommee(mots.slice(0, n).join(" "), o.personnes, o.moiId);
        if (p) {
          personne = p;
          const debut = m.index + m[1].length;
          const fin = debut + m[0].slice(m[1].length).indexOf(mots[n - 1]) + mots[n - 1].length;
          trouves.push(texte.slice(debut, fin).trim());
          texte = `${texte.slice(0, m.index)} ${texte.slice(fin)}`;
        }
      }
    }
  }
  return { texte: texte.replace(/\s+/g, " ").trim(), personne, invites, projet, trouves };
}

// ---------------------------------------------------------------------------
// Une ligne de formulaire écrite comme dans la barre (ligne du rapport, action de réunion, titre d'une tâche)
// ---------------------------------------------------------------------------

export type AnalyseLigne<P extends Nomme> = { texte: string; projet: ProjetSaisie | null; personne: P | null; echeance: string | null; heures: number | null };

/**
 * « Recette validée UR », « Recette validée projet retail », « Envoyer le compte rendu pour Fabienne vendredi » :
 * le projet (code en majuscules ou « projet … »), la personne (« pour … »), et, si on le demande, l'échéance et le
 * temps estimé. Chaque formulaire n'active que ce qui le concerne : une ligne du rapport ne lit que le projet
 * (« le 15/11 » y reste du texte). Le texte rendu est la ligne sans les mots reconnus.
 */
export function analyserLigne<P extends Nomme>(
  saisie: string,
  o: { projets?: ProjetSaisie[]; personnes?: P[]; moiId?: string; aujourdhui?: string; heures?: boolean },
): AnalyseLigne<P> {
  const mots = reconnaitreMots(String(saisie ?? "").replace(/\s+/g, " ").trim().slice(0, 500), { personnes: o.personnes ?? [], projets: o.projets ?? [], moiId: o.moiId });
  let texte = ` ${mots.texte} `;
  let projet = mots.projet;
  if (!projet && o.projets?.length) {
    const c = extraireCodeProjet(texte, o.projets);
    projet = c.projet;
    texte = c.reste;
  }
  let echeance: string | null = null;
  if (o.aujourdhui) {
    const e = extraireEcheance(texte, o.aujourdhui);
    echeance = e.echeance;
    texte = e.reste;
  }
  let heures: number | null = null;
  if (o.heures) {
    const h = extraireHeures(texte);
    heures = h.heures;
    texte = h.reste;
  }
  return { texte: nettoyer(texte, 500), projet, personne: mots.personne, echeance, heures };
}

// ---------------------------------------------------------------------------
// De quoi parle la ligne
// ---------------------------------------------------------------------------

export type Genre = "question" | "reunion" | "note" | "projet" | "tache";

export function genreDe(saisie: string, o: { projetChoisi: boolean; projets: ProjetSaisie[]; aujourdhui: string }): Genre {
  if (estQuestion(saisie)) return "question";
  if (estReunion(saisie)) return "reunion";
  if (rubriqueDeNote(saisie)) return "note";
  if (o.projetChoisi && analyserMajProjet(saisie, o.aujourdhui)) return "projet";
  if (projetEnTete(saisie, o.projets, o.aujourdhui)) return "projet";
  return "tache";
}
