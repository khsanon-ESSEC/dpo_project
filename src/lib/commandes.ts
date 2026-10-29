/**
 * Les actions de la barre (demandé le 29 octobre 2026 : « effectuer toutes les actions dans la barre ») : une
 * phrase qui commande une action précise, sur un projet ou ailleurs. Pur (sans base) : il sert à l'aperçu dans la
 * page et, à nouveau, au serveur, qui relit la phrase avec ses propres données et vérifie les droits
 * (src/lib/donnees/commandes.ts). Testé dans tests/commandes.test.ts.
 *
 * Le projet se désigne comme ailleurs dans la barre : son code en tête (« UR … »), « / » dans la liste, ou
 * « projet Credos ». Une phrase sans projet reste une tâche, sauf quand le verbe est sans ambiguïté et que le
 * livrable, le risque ou la phase nommés n'existent que dans un seul projet.
 */
import { personneNommee, projetNomme, type Nomme } from "@/lib/barre";
import { jourComplet, premierDuMois } from "@/lib/dates";
import { cleNom } from "@/lib/projets";
import { extraireCodeProjet, extraireEcheance, type ProjetSaisie } from "@/lib/saisie-rapide";
import { LIBELLE_OBJECTIFS, LIBELLE_PRIORITE, lireMontant, montantTexte, type Objectifs, type Priorite } from "@/lib/suivi";

/** Un livrable, une phase ou un risque d'un projet, tel que la barre le connaît. */
export type ElementProjet = { id: string; projetId: string; libelle: string; etat: string };

export type ContexteCommande = {
  projets: ProjetSaisie[];
  /** Les personnes qu'on peut nommer (responsable, sponsor, équipe, chef) ; « moi » désigne moiId. */
  personnes: Nomme[];
  livrables: ElementProjet[];
  phases: ElementProjet[];
  risques: ElementProjet[];
  aujourdhui: string;
  moiId?: string;
};

export type ActionLivrableBarre = "pret" | "valider" | "renvoyer" | "rouvrir";
export type StatutRisqueBarre = "ouvert" | "maitrise" | "clos";

export type Commande =
  | { type: "nouveau_projet"; titre: string; justification: string; chefId: string | null; fin: string | null; code: string | null; strategique: boolean }
  | { type: "livrable_creer"; libelle: string; prevuLe: string | null; responsableId: string | null }
  | { type: "livrable_modifier"; livrableId: string; prevuLe: string | null; responsableId: string | null }
  | { type: "livrable_etat"; livrableId: string; action: ActionLivrableBarre; remarque: string }
  | { type: "membre_ajouter"; personneId: string; role: string }
  | { type: "membre_retirer"; personneId: string }
  | { type: "decision"; texte: string; instance: string }
  | { type: "risque_creer"; titre: string; probabilite: 1 | 2 | 3; impact: 1 | 2 | 3; responsableId: string | null }
  | { type: "risque_statut"; risqueId: string; statut: StatutRisqueBarre }
  | { type: "phase_terminer"; phaseId: string | null }
  | { type: "phases_types" }
  | { type: "phase_ajouter"; nom: string; debut: string | null; fin: string | null }
  | { type: "sponsor"; personneId: string | null }
  | { type: "chef"; personneId: string }
  | { type: "priorite"; priorite: Priorite }
  | { type: "budget"; prevu: number | null; engage: number | null; devise: "HTG" | "USD" | null }
  | { type: "cloturer"; bilan: string; objectifs: Objectifs }
  | { type: "rouvrir" }
  | { type: "envoyer_rapport" }
  | { type: "rapport_ponctuel"; titre: string; objet: string }
  /** Ouvrir un écran (un formulaire à compléter, un document à télécharger). */
  | { type: "aller"; lien: string };

/** Une action reconnue : ce qu'elle fera (« resume »), ou ce qui manque (« manque »), et le projet visé. */
export type AnalyseCommande = {
  commande: Commande | null;
  projet: ProjetSaisie | null;
  resume: string;
  /** Ce qui manque pour agir (la phrase est bien une action, mais incomplète) : affiché, rien n'est envoyé. */
  manque?: string;
  /** « Générer un rapport » : plusieurs actions possibles, à choisir. */
  choix?: { libelle: string; texte: string }[];
};

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

const MOT = "[\\p{L}][\\p{L}'’-]*";
const PETITS = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "a", "au", "aux", "et", "en", "un", "une", "sur", "pour"]);
const espaces = (s: string) => s.replace(/\s+/g, " ").trim();
const majuscule = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sansPonctuationFin = (s: string) => s.replace(/[\s,;:.–—-]+$/u, "").replace(/^[\s,;:.–—-]+/u, "");

/** Les mots qui comptent pour reconnaître un livrable, un risque ou une phase. */
const motsUtiles = (s: string) => cleNom(s).split(" ").filter((m) => m && !PETITS.has(m));

/** L'élément que désignent ces mots : tous ses mots y sont ; s'il y en a plusieurs, celui qui est exactement nommé. */
export function elementNomme(mots: string, elements: ElementProjet[]): { element: ElementProjet } | { plusieurs: ElementProjet[] } | null {
  const m = motsUtiles(mots);
  if (!m.length) return null;
  const trouves = elements.filter((e) => {
    const l = ` ${cleNom(e.libelle)} `;
    return m.every((x) => l.includes(` ${x}`));
  });
  if (trouves.length === 1) return { element: trouves[0] };
  if (!trouves.length) return null;
  const exact = trouves.filter((e) => motsUtiles(e.libelle).join(" ") === m.join(" "));
  return exact.length === 1 ? { element: exact[0] } : { plusieurs: trouves };
}

/** « … pour Daphnée », « … à Daphnée Joseph », « … suivi par moi » à la fin : la personne et le texte sans elle. */
function personneEnFin(t: string, cles: string, ctx: ContexteCommande): { personne: Nomme | null; reste: string } {
  const rx = new RegExp(`(?:^|\\s)(?:${cles})\\s+(${MOT}(?:\\s+${MOT}){0,2})\\s*$`, "iu");
  const m = rx.exec(t);
  const p = m ? personneNommee(m[1], ctx.personnes, ctx.moiId) : null;
  return p ? { personne: p, reste: t.slice(0, m!.index).trim() } : { personne: null, reste: t };
}

const PERSONNE_FIN = "pour|[àa]|responsable|confi[ée]e?\\s+[àa]|suivi\\s+par|par";

// ---------------------------------------------------------------------------
// Le projet de la phrase
// ---------------------------------------------------------------------------

/** Le projet désigné (choisi avec « / », code en tête, « projet … », ou code dans la phrase) et le texte sans lui. */
export function projetDeLaPhrase(saisie: string, ctx: ContexteCommande, choisi: ProjetSaisie | null): { projet: ProjetSaisie | null; reste: string } {
  const t = espaces(saisie);
  if (choisi) return { projet: choisi, reste: t };
  const tete = /^([A-Z0-9]{2,4})\s+(.+)$/.exec(t);
  if (tete && /[A-Z]/.test(tete[1])) {
    const p = ctx.projets.find((x) => x.code.toUpperCase() === tete[1]);
    if (p) return { projet: p, reste: tete[2] };
  }
  const rp = new RegExp(`(?:^|\\s)(?:(?:sur|pour|du|dans)\\s+(?:le\\s+)?)?projet\\s+((?:${MOT}\\s*){1,4})`, "iu").exec(t);
  if (rp) {
    const mots = rp[1].trim().split(/\s+/);
    for (let n = Math.min(4, mots.length); n >= 1; n--) {
      const p = projetNomme(mots.slice(0, n).join(" "), ctx.projets);
      if (p) {
        const debut = rp.index;
        const fin = rp.index + rp[0].indexOf(mots[n - 1], rp[0].indexOf(mots[0])) + mots[n - 1].length;
        return { projet: p, reste: espaces(`${t.slice(0, debut)} ${t.slice(fin)}`) };
      }
    }
  }
  const c = extraireCodeProjet(` ${t} `, ctx.projets);
  return { projet: c.projet, reste: espaces(c.reste) };
}

// ---------------------------------------------------------------------------
// Les actions sans projet : créer un projet, les rapports
// ---------------------------------------------------------------------------

function nouveauProjet(t: string, ctx: ContexteCommande): AnalyseCommande | null {
  const m = /^(?:nouveau|cr[ée]er(?:\s+(?:un|le))?|proposer(?:\s+(?:un|le))?|ouvrir\s+un)\s+projet\s*[:：]\s*(.*)$/iu.exec(t);
  if (!m) return null;
  let reste = ` ${m[1]} `;
  let strategique = false;
  if (/\sstrat[ée]gique(?=[\s,.;:])/iu.test(reste)) {
    strategique = true;
    reste = reste.replace(/\s(?:projet\s+)?strat[ée]gique(?=[\s,.;:])/iu, " ");
  }
  let code: string | null = null;
  const c = /\scode\s+([A-Za-z0-9]{2,4})(?=[\s,.;:])/u.exec(reste);
  if (c) {
    code = c[1].toUpperCase();
    reste = `${reste.slice(0, c.index)} ${reste.slice(c.index + c[0].length)}`;
  }
  let fin: string | null = null;
  const f = /\s(?:fin(?:\s+pr[ée]vue|\s+souhait[ée]e)?|pour\s+le|d['’]ici\s+(?:le\s+)?)\s+([^,;:]+?)(?=$|[,;:]|\s+chef)/iu.exec(reste);
  if (f) {
    const d = extraireEcheance(` ${f[1]} `, ctx.aujourdhui);
    if (d.echeance && !d.reste.trim()) {
      fin = d.echeance;
      reste = `${reste.slice(0, f.index)} ${reste.slice(f.index + f[0].length)}`;
    }
  }
  let chefId: string | null = null;
  const ch = new RegExp(`\\s(?:avec\\s+)?(?:pour\\s+)?chef(?:\\s+de\\s+projet)?\\s*:?\\s+(${MOT}(?:\\s+${MOT})?)`, "iu").exec(reste);
  if (ch) {
    const mots = ch[1].split(/\s+/);
    for (let n = mots.length; n >= 1 && !chefId; n--) {
      const p = personneNommee(mots.slice(0, n).join(" "), ctx.personnes, ctx.moiId);
      if (p) {
        chefId = p.id;
        const fin2 = ch.index + ch[0].indexOf(mots[n - 1], ch[0].length - ch[1].length) + mots[n - 1].length;
        reste = `${reste.slice(0, ch.index)} ${reste.slice(fin2)}`;
      }
    }
  }
  // « Titre : pourquoi », ou « Titre, car … », « Titre parce que … ».
  const parts = /^(.*?)(?:\s*:\s*|\s*[,;]?\s+(?:car|parce\s+que|pour\s+que|afin\s+de)\s+)(.*)$/iu.exec(espaces(reste));
  const titre = majuscule(sansPonctuationFin(espaces(parts ? parts[1] : reste))).slice(0, 160);
  const justification = majuscule(sansPonctuationFin(espaces(parts ? parts[2] : ""))).slice(0, 2000);
  const chef = chefId ? ctx.personnes.find((p) => p.id === chefId) : null;
  const resume = `Nouveau projet « ${titre || "…"} »${code ? ` (${code})` : ""}${strategique ? ", stratégique" : ""}${chef ? `, chef : ${chef.nom}` : ""}${fin ? `, fin ${jourComplet(fin).toLowerCase()}` : ""}`;
  if (!titre) return { commande: null, projet: null, resume, manque: "Écrivez son titre : « Nouveau projet : Refonte du site : l'actuel ne s'affiche pas sur téléphone »." };
  if (!justification) return { commande: null, projet: null, resume, manque: "Dites pourquoi après un deux-points : « Nouveau projet : Refonte du site : l'actuel ne s'affiche pas sur téléphone »." };
  return { commande: { type: "nouveau_projet", titre, justification, chefId, fin, code, strategique }, projet: null, resume };
}

/** Les rapports qu'on peut demander à la barre (« générer un rapport »). */
export function choixRapports(): { libelle: string; texte: string }[] {
  return [
    { libelle: "Ouvrir mon rapport de la semaine", texte: "mon rapport de la semaine" },
    { libelle: "Envoyer mon rapport de la semaine", texte: "envoyer mon rapport" },
    { libelle: "Préparer le rapport au conseil du mois", texte: "rapport au conseil" },
    { libelle: "Télécharger le rapport au conseil (Word)", texte: "rapport au conseil en Word" },
    { libelle: "Créer un rapport ponctuel au conseil", texte: "rapport ponctuel : " },
    { libelle: "Voir mon bilan", texte: "mon bilan" },
    { libelle: "Voir le bilan de l'équipe", texte: "bilan de l'équipe" },
  ];
}

function rapports(t: string, ctx: ContexteCommande): AnalyseCommande | null {
  const c = cleNom(t);
  if (/^(?:generer|preparer|faire|produire|sortir|creer)\s+(?:un|le|les|mon|des)\s+rapports?$/.test(c) || /^rapports?$/.test(c))
    return { commande: null, projet: null, resume: "Quel rapport ?", choix: choixRapports() };
  if (/^envoyer\s+(?:mon|le)\s+rapport(?:\s+(?:du\s+vendredi|de\s+la\s+semaine|hebdomadaire))?$/.test(c))
    return { commande: { type: "envoyer_rapport" }, projet: null, resume: "Envoyer votre rapport de la semaine à votre supérieur" };
  if (/^(?:(?:ouvrir|voir|remplir|rediger|preparer|generer)\s+)?(?:mon|le)\s+rapport(?:\s+(?:du\s+vendredi|de\s+la\s+semaine|hebdomadaire))$/.test(c) || /^mon\s+rapport$/.test(c))
    return { commande: { type: "aller", lien: "/rapport" }, projet: null, resume: "Ouvrir votre rapport de la semaine" };
  const conseil = /^(?:(?:generer|preparer|ouvrir|voir|faire|telecharger|exporter)\s+)?(?:le\s+)?rapport\s+(?:mensuel\s+)?(?:au|du)\s+conseil(?:\s+(?:en|au\s+format)\s+word|\s+word|\s+docx)?$/.exec(c);
  if (conseil) {
    const word = /word|docx|telecharger|exporter/.test(c);
    return word
      ? { commande: { type: "aller", lien: `/api/conseil/${premierDuMois(ctx.aujourdhui)}/word` }, projet: null, resume: "Télécharger le rapport au conseil du mois (Word)" }
      : { commande: { type: "aller", lien: "/conseil" }, projet: null, resume: "Préparer le rapport au conseil du mois" };
  }
  const ponctuel = /^(?:(?:nouveau|cr[ée]er|pr[ée]parer)\s+(?:un\s+)?)?rapport\s+ponctuel(?:\s+au\s+conseil)?\s*[:：]\s*(.*)$/iu.exec(t);
  if (ponctuel) {
    const [titre, ...objet] = ponctuel[1].split(/\s*[:：]\s*/);
    const ti = majuscule(sansPonctuationFin(espaces(titre ?? ""))).slice(0, 120);
    const resume = `Rapport ponctuel au conseil « ${ti || "…"} » sur les projets stratégiques`;
    if (!ti) return { commande: null, projet: null, resume, manque: "Donnez son titre : « rapport ponctuel : point sur UNIBANKOnline : pour le conseil du 15 »." };
    return { commande: { type: "rapport_ponctuel", titre: ti, objet: majuscule(espaces(objet.join(" : "))).slice(0, 1500) }, projet: null, resume };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Les actions sur un projet
// ---------------------------------------------------------------------------

type Avec = { projet: ProjetSaisie | null; explicite: boolean };

/** Le livrable désigné : dans le projet donné, ou, sans projet, s'il n'existe que dans un seul. */
function livrableNomme(mots: string, ctx: ContexteCommande, projet: ProjetSaisie | null) {
  const l = elementNomme(mots, projet ? ctx.livrables.filter((x) => x.projetId === projet.id) : ctx.livrables);
  return l;
}

function livrable(t: string, ctx: ContexteCommande, o: Avec): AnalyseCommande | null {
  const projetDe = (e: ElementProjet) => o.projet ?? ctx.projets.find((p) => p.id === e.projetId) ?? null;
  const nomLivrable = (e: ElementProjet) => `« ${e.libelle} »`;
  const plusieurs = (l: ElementProjet[]) => `Plusieurs livrables correspondent : ${l.slice(0, 4).map((x) => `« ${x.libelle} »`).join(", ")}. Précisez.`;

  // Valider, renvoyer, rouvrir, déclarer prêt : le verbe d'abord.
  const v = /^(valider|renvoyer|rouvrir|d[ée]clarer)\s+(?:le\s+)?livrable\s+(.+?)(?:\s+pr[êe]t(?:\s+[àa]\s+valider)?)?(?:\s*[:：]\s*(.+))?$/iu.exec(t);
  if (v) {
    const action: ActionLivrableBarre = /^valid/i.test(v[1]) ? "valider" : /^renvoy/i.test(v[1]) ? "renvoyer" : /^rouvr/i.test(v[1]) ? "rouvrir" : "pret";
    const r = livrableNomme(v[2], ctx, o.projet);
    if (!r && !o.projet) return null;
    if (!r) return { commande: null, projet: o.projet, resume: "Livrable", manque: `Aucun livrable ne s'appelle « ${v[2]} »${o.projet ? ` dans ${o.projet.code}` : ""}.` };
    if ("plusieurs" in r) return { commande: null, projet: o.projet, resume: "Livrable", manque: plusieurs(r.plusieurs) };
    const remarque = majuscule(espaces(v[3] ?? "")).slice(0, 500);
    const resume = { pret: "Déclarer prêt à valider", valider: "Valider", renvoyer: "Renvoyer à reprendre", rouvrir: "Rouvrir" }[action] + ` le livrable ${nomLivrable(r.element)}${remarque ? ` : ${remarque}` : ""}`;
    if (action === "renvoyer" && !remarque) return { commande: null, projet: projetDe(r.element), resume, manque: "Dites ce qui reste à reprendre après un deux-points." };
    return { commande: { type: "livrable_etat", livrableId: r.element.id, action, remarque }, projet: projetDe(r.element), resume };
  }

  // Assigner, confier : « assigner le livrable Audit à Daphnée ».
  const a = /^(?:assigner|confier|attribuer|donner)\s+(?:le\s+)?livrable\s+(.+)$/iu.exec(t);
  if (a) {
    const p = personneEnFin(a[1], "[àa]|pour", ctx);
    const r = livrableNomme(p.reste, ctx, o.projet);
    const resume = `Confier le livrable${r && "element" in r ? ` ${nomLivrable(r.element)}` : ""}${p.personne ? ` à ${p.personne.nom}` : ""}`;
    if (!r && !o.projet) return null;
    if (!r) return { commande: null, projet: o.projet, resume, manque: `Aucun livrable ne s'appelle « ${p.reste} »${o.projet ? ` dans ${o.projet.code}` : ""}.` };
    if ("plusieurs" in r) return { commande: null, projet: o.projet, resume, manque: plusieurs(r.plusieurs) };
    if (!p.personne) return { commande: null, projet: projetDe(r.element), resume, manque: "À qui ? « … à Daphnée »." };
    return { commande: { type: "livrable_modifier", livrableId: r.element.id, prevuLe: null, responsableId: p.personne.id }, projet: projetDe(r.element), resume };
  }

  // Le reste demande un projet (« UR livrable … », « / »).
  if (!o.projet) return null;
  const nouveau = /^(?:nouveau|ajouter(?:\s+(?:un|le))?|cr[ée]er(?:\s+(?:un|le))?)\s+livrable\s*[:：]?\s*(.*)$/iu.exec(t);
  const simple = /^(?:jalon|livrable)\s*[:：]?\s*(.*)$/iu.exec(t);
  if (!nouveau && !simple) return null;
  let texte = ` ${(nouveau ?? simple)![1]} `;
  // L'état à la fin : « … prêt », « … validé », « … à reprendre : … », « … rouvert ».
  let action: ActionLivrableBarre | null = null;
  let remarque = "";
  const fin = /\s(pr[êe]t(?:\s+[àa]\s+valider)?|valid[ée]e?|[àa]\s+reprendre|renvoy[ée]e?|rouvert|[àa]\s+rouvrir)(?:\s*[:：]\s*(.+))?\s*$/iu.exec(texte);
  const sansEtat = fin ? texte.slice(0, fin.index) : texte;
  if (fin) {
    action = /^pr/i.test(fin[1]) ? "pret" : /^valid/i.test(fin[1]) ? "valider" : /reprendre|renvoy/i.test(fin[1]) ? "renvoyer" : "rouvrir";
    remarque = majuscule(espaces(fin[2] ?? "")).slice(0, 500);
  }
  // Une date, une personne (« pour Daphnée »).
  const e = extraireEcheance(` ${sansEtat} `, ctx.aujourdhui);
  const p = personneEnFin(espaces(e.reste), PERSONNE_FIN, ctx);
  const libelle = majuscule(sansPonctuationFin(espaces(p.reste)));
  const existant = !nouveau && libelle ? livrableNomme(libelle, ctx, o.projet) : null;
  if (existant && "plusieurs" in existant) return { commande: null, projet: o.projet, resume: "Livrable", manque: plusieurs(existant.plusieurs) };
  if (existant && "element" in existant) {
    const l = existant.element;
    if (action) {
      const resume = { pret: "Déclarer prêt à valider", valider: "Valider", renvoyer: "Renvoyer à reprendre", rouvrir: "Rouvrir" }[action] + ` le livrable ${nomLivrable(l)}${remarque ? ` : ${remarque}` : ""}`;
      if (action === "renvoyer" && !remarque) return { commande: null, projet: o.projet, resume, manque: "Dites ce qui reste à reprendre : « … à reprendre : compléter le point 6 »." };
      return { commande: { type: "livrable_etat", livrableId: l.id, action, remarque }, projet: o.projet, resume };
    }
    if (p.personne || e.echeance) {
      const resume = `Livrable ${nomLivrable(l)} : ${[p.personne ? `responsable ${p.personne.nom}` : null, e.echeance ? `prévu ${jourComplet(e.echeance).toLowerCase()}` : null].filter(Boolean).join(", ")}`;
      return { commande: { type: "livrable_modifier", livrableId: l.id, prevuLe: e.echeance, responsableId: p.personne?.id ?? null }, projet: o.projet, resume };
    }
    return { commande: { type: "aller", lien: `/projets/${o.projet.id}#livrable-${l.id}` }, projet: o.projet, resume: `Ouvrir le livrable ${nomLivrable(l)} (ajoutez « pour … », une date, « prêt » ou « validé » pour le changer)` };
  }
  // Pas de livrable de ce nom : on le crée (avec son état éventuel dans le nom : « Modèle conceptuel validé »).
  const nom = majuscule(sansPonctuationFin(espaces(fin && !nouveau ? `${p.reste} ${fin[1]}` : p.reste)));
  const resume = `Nouveau livrable « ${nom || "…"} »${e.echeance ? `, prévu ${jourComplet(e.echeance).toLowerCase()}` : ""}${p.personne ? `, responsable ${p.personne.nom}` : ""}`;
  if (!nom) return { commande: null, projet: o.projet, resume, manque: "Donnez son nom : « UR nouveau livrable maquettes validées 15/12 pour Daphnée »." };
  return { commande: { type: "livrable_creer", libelle: nom.slice(0, 200), prevuLe: e.echeance, responsableId: p.personne?.id ?? null }, projet: o.projet, resume };
}

function equipe(t: string, ctx: ContexteCommande, o: Avec): AnalyseCommande | null {
  if (!o.projet) return null;
  const aj =
    new RegExp(`^ajouter\\s+(.+?)\\s+(?:[àa]|dans)\\s+l['’]?\\s*[ée]quipe(?:\\s+(?:du\\s+projet))?(?:\\s+(?:comme|en\\s+tant\\s+que|en)\\s+(.+))?$`, "iu").exec(t) ??
    /^[ée]quipe\s*(?:[+:：]|\s)\s*(.+?)(?:\s+(?:comme|en\s+tant\s+que)\s+(.+)|\s*\((.+)\))?$/iu.exec(t);
  if (aj) {
    const p = personneNommee(aj[1], ctx.personnes, ctx.moiId);
    const role = majuscule(espaces(aj[2] ?? aj[3] ?? "")).slice(0, 80);
    const resume = `Ajouter ${p ? p.nom : `« ${aj[1]} »`} à l'équipe${role ? ` (${role.toLowerCase()})` : ""}`;
    if (!p) return { commande: null, projet: o.projet, resume, manque: `Personne ne s'appelle « ${aj[1]} » (ou plusieurs personnes) : précisez le nom.` };
    return { commande: { type: "membre_ajouter", personneId: p.id, role }, projet: o.projet, resume };
  }
  const re = /^retirer\s+(.+?)\s+(?:de\s+l['’]?\s*[ée]quipe|du\s+projet)$/iu.exec(t);
  if (re) {
    const p = personneNommee(re[1], ctx.personnes, ctx.moiId);
    const resume = `Retirer ${p ? p.nom : `« ${re[1]} »`} de l'équipe`;
    if (!p) return { commande: null, projet: o.projet, resume, manque: `Personne ne s'appelle « ${re[1]} ».` };
    return { commande: { type: "membre_retirer", personneId: p.id }, projet: o.projet, resume };
  }
  return null;
}

// L'instance à la fin : « (comité de pilotage) », « par le copil », « prise par la direction ».
const INSTANCE = /\s*(?:[(\[]\s*(?:(?:par|prise\s+par|selon)\s+)?|(?:par|prise\s+par|selon)\s+)(?:le\s+|la\s+|l['’])?((?:comit[ée]|direction|chef|conseil|copil|comex|sponsor)[^()\[\]]{0,70}?)[)\]]?\s*$/iu;

function decision(t: string, o: Avec): AnalyseCommande | null {
  if (!o.projet) return null;
  const m = /^(?:d[ée]cision\s+prise|d[ée]cid[ée]|on\s+a\s+d[ée]cid[ée](?:\s+que)?|registre)\s*[:：]?\s*(.+)$/iu.exec(t);
  if (!m) return null;
  let texte = m[1];
  let instance = "";
  const i = INSTANCE.exec(texte);
  if (i) {
    instance = majuscule(espaces(i[1]));
    instance = /^copil$/i.test(instance) ? "Comité de pilotage" : /^comex$/i.test(instance) ? "Comité exécutif" : instance;
    texte = texte.slice(0, i.index);
  }
  texte = majuscule(sansPonctuationFin(espaces(texte))).slice(0, 1000);
  const resume = `Décision au registre : « ${texte || "…"} »${instance ? ` (${instance})` : ""}`;
  if (!texte) return { commande: null, projet: o.projet, resume, manque: "Écrivez la décision : « UR décision prise : mise en ligne en deux vagues (comité de pilotage) »." };
  return { commande: { type: "decision", texte, instance }, projet: o.projet, resume };
}

function niveauDe(texte: string, quoi: "probabilite" | "impact"): { niveau: 1 | 2 | 3 | null; reste: string } {
  const motifs: [RegExp, 1 | 2 | 3][] =
    quoi === "probabilite"
      ? [
          [/[\s,;]+(?:probabilit[ée]\s+(?:faible|basse)|peu\s+probable|improbable)(?=$|[\s,;.])/iu, 1],
          [/[\s,;]+(?:probabilit[ée]\s+(?:forte|haute|[ée]lev[ée]e)|tr[èe]s\s+probable|probable)(?=$|[\s,;.])/iu, 3],
          [/[\s,;]+probabilit[ée]\s+moyenne(?=$|[\s,;.])/iu, 2],
        ]
      : [
          [/[\s,;]+impact\s+(?:faible|mineur|limit[ée])(?=$|[\s,;.])/iu, 1],
          [/[\s,;]+impact\s+(?:fort|[ée]lev[ée]|grave|critique|majeur)(?=$|[\s,;.])/iu, 3],
          [/[\s,;]+impact\s+moyen(?=$|[\s,;.])/iu, 2],
        ];
  for (const [rx, n] of motifs) {
    const m = rx.exec(texte);
    if (m) return { niveau: n, reste: `${texte.slice(0, m.index)} ${texte.slice(m.index + m[0].length)}` };
  }
  return { niveau: null, reste: texte };
}

function risque(t: string, ctx: ContexteCommande, o: Avec): AnalyseCommande | null {
  const nouveau = /^(?:nouveau|ajouter(?:\s+(?:un|le))?|noter(?:\s+(?:un|le))?)\s+risque(?:\s+au\s+registre)?\s*[:：]?\s*(.*)$/iu.exec(t);
  if (nouveau) {
    if (!o.projet) return null;
    let texte = ` ${nouveau[1]} `;
    const pr = niveauDe(texte, "probabilite");
    texte = pr.reste;
    const im = niveauDe(texte, "impact");
    texte = im.reste;
    const p = personneEnFin(espaces(texte), "suivi\\s+par|responsable|pour", ctx);
    const titre = majuscule(sansPonctuationFin(espaces(p.reste))).slice(0, 200);
    const probabilite = pr.niveau ?? 2;
    const impact = im.niveau ?? 2;
    const crit = probabilite * impact;
    const resume = `Nouveau risque au registre : « ${titre || "…"} » · ${crit >= 6 ? "critique" : crit >= 3 ? "modéré" : "faible"} (${probabilite} × ${impact})${p.personne ? `, suivi par ${p.personne.nom}` : ""}`;
    if (!titre) return { commande: null, projet: o.projet, resume, manque: "Décrivez le risque : « UR nouveau risque : retard du prestataire, probable, impact fort »." };
    return { commande: { type: "risque_creer", titre, probabilite, impact, responsableId: p.personne?.id ?? null }, projet: o.projet, resume };
  }
  // « risque prestataire maîtrisé », « clore le risque prestataire », « rouvrir le risque … ».
  const s1 = /^risque\s+(.+?)\s*[:：]?\s+(ma[îi]tris[ée]|clos|clôtur[ée]|ferm[ée]|rouvert|ouvert)$/iu.exec(t);
  const s2 = /^(ma[îi]triser|clore|cl[ôo]turer|fermer|rouvrir)\s+(?:le\s+)?risque\s+(.+)$/iu.exec(t);
  if (!s1 && !s2) return null;
  const mots = s1 ? s1[1] : s2![2];
  const verbe = cleNom(s1 ? s1[2] : s2![1]);
  const statut: StatutRisqueBarre = /^ma/.test(verbe) ? "maitrise" : /^(?:clo|clot|fer)/.test(verbe) ? "clos" : "ouvert";
  const r = elementNomme(mots, o.projet ? ctx.risques.filter((x) => x.projetId === o.projet!.id) : ctx.risques);
  const libelle = { maitrise: "Marquer maîtrisé", clos: "Clore", ouvert: "Rouvrir" }[statut];
  if (!r) return o.projet ? { commande: null, projet: o.projet, resume: `${libelle} un risque`, manque: `Aucun risque du registre ne correspond à « ${mots} ».` } : null;
  if ("plusieurs" in r) return { commande: null, projet: o.projet, resume: `${libelle} un risque`, manque: `Plusieurs risques correspondent : ${r.plusieurs.slice(0, 3).map((x) => `« ${x.libelle} »`).join(", ")}.` };
  const projet = o.projet ?? ctx.projets.find((p) => p.id === r.element.projetId) ?? null;
  return { commande: { type: "risque_statut", risqueId: r.element.id, statut }, projet, resume: `${libelle} le risque « ${r.element.libelle} »` };
}

function phases(t: string, ctx: ContexteCommande, o: Avec): AnalyseCommande | null {
  if (!o.projet) return null;
  const projet = o.projet;
  const siennes = ctx.phases.filter((x) => x.projetId === projet.id);
  if (/^(?:utiliser\s+les\s+)?phases?\s+types?$/iu.test(t)) return { commande: { type: "phases_types" }, projet, resume: "Découper le projet en phases types (Cadrage … Clôture)" };
  const term = /^(?:terminer\s+(?:la\s+)?phase(?:\s+(?:en\s+cours|actuelle))?(?:\s+(.+))?|phase\s+(.+?)\s+termin[ée]e)$/iu.exec(t);
  if (term) {
    const nom = term[1] ?? term[2];
    if (!nom) {
      const enCours = siennes.find((x) => x.etat !== "terminee");
      return enCours
        ? { commande: { type: "phase_terminer", phaseId: null }, projet, resume: `Terminer la phase en cours (« ${enCours.libelle} »)` }
        : { commande: null, projet, resume: "Terminer la phase en cours", manque: siennes.length ? "Toutes les phases sont terminées." : "Ce projet n'a pas de phases : « UR phases types »." };
    }
    const r = elementNomme(nom, siennes);
    if (!r) return { commande: null, projet, resume: "Terminer une phase", manque: `Aucune phase ne s'appelle « ${nom} ».` };
    if ("plusieurs" in r) return { commande: null, projet, resume: "Terminer une phase", manque: "Plusieurs phases correspondent : précisez." };
    return { commande: { type: "phase_terminer", phaseId: r.element.id }, projet, resume: `Terminer la phase « ${r.element.libelle} »` };
  }
  const aj = /^(?:nouvelle|ajouter(?:\s+(?:une|la))?)\s+phase\s*[:：]?\s*(.+)$/iu.exec(t);
  if (aj) {
    let texte = ` ${aj[1]} `;
    const d1 = extraireEcheance(texte, ctx.aujourdhui);
    texte = d1.reste;
    const d2 = d1.echeance ? extraireEcheance(texte, ctx.aujourdhui) : { echeance: null, reste: texte };
    texte = d2.reste;
    const dates = [d1.echeance, d2.echeance].filter((x): x is string => !!x).sort();
    const nom = majuscule(sansPonctuationFin(espaces(texte.replace(/\s(?:du|de|au|jusqu['’]au|jusqu['’][àa])(?=\s|$)/giu, " ")))).slice(0, 80);
    const [debut, fin] = dates.length === 2 ? dates : [null, dates[0] ?? null];
    const resume = `Nouvelle phase « ${nom || "…"} »${debut ? ` du ${jourComplet(debut).toLowerCase()}` : ""}${fin ? ` jusqu'au ${jourComplet(fin).toLowerCase()}` : ""}`;
    if (!nom) return { commande: null, projet, resume, manque: "Donnez son nom : « UR nouvelle phase pilote en agence du 2/11 au 30/11 »." };
    return { commande: { type: "phase_ajouter", nom, debut, fin }, projet, resume };
  }
  return null;
}

function champsProjet(t: string, ctx: ContexteCommande, o: Avec): AnalyseCommande | null {
  if (!o.projet) return null;
  const projet = o.projet;
  const sp = /^(?:sponsor(?:\s+m[ée]tier)?|sans\s+sponsor)\s*[:：]?\s*(.*)$/iu.exec(t);
  if (sp) {
    if (/^sans/i.test(t) || /^(?:aucun|personne)$/i.test(sp[1].trim())) return { commande: { type: "sponsor", personneId: null }, projet, resume: "Retirer le sponsor métier" };
    const p = personneNommee(sp[1], ctx.personnes, ctx.moiId);
    const resume = `Sponsor métier : ${p ? p.nom : `« ${sp[1]} »`}`;
    if (!p) return sp[1].trim().split(" ").length <= 3 && sp[1].trim() ? { commande: null, projet, resume, manque: `Personne ne s'appelle « ${sp[1]} » (ou plusieurs personnes).` } : null;
    return { commande: { type: "sponsor", personneId: p.id }, projet, resume };
  }
  const ch = /^(?:nouveau\s+)?chef(?:\s+de\s+projet)\s*[:：]?\s*(.+)$/iu.exec(t);
  if (ch) {
    const p = personneNommee(ch[1], ctx.personnes, ctx.moiId);
    const resume = `Chef de projet : ${p ? p.nom : `« ${ch[1]} »`}`;
    if (!p) return ch[1].trim().split(" ").length <= 3 ? { commande: null, projet, resume, manque: `Personne ne s'appelle « ${ch[1]} » (ou plusieurs personnes).` } : null;
    return { commande: { type: "chef", personneId: p.id }, projet, resume };
  }
  const pr = /^priorit[ée]\s*[:：]?\s*(haute|normale|basse|urgente?|forte|faible|moyenne)$/iu.exec(t);
  if (pr) {
    const v = cleNom(pr[1]);
    const priorite: Priorite = /haute|urgent|forte/.test(v) ? "haute" : /basse|faible/.test(v) ? "basse" : "normale";
    return { commande: { type: "priorite", priorite }, projet, resume: `Priorité du projet : ${LIBELLE_PRIORITE[priorite].toLowerCase()}` };
  }
  const bu = /^(?:budget|engag[ée]s?|d[ée]pens[ée]s?)(?=$|[\s:：])\s*[:：]?\s*(.*)$/iu.exec(t);
  if (bu) {
    const texte = ` ${t} `;
    const devise: "HTG" | "USD" | null = /\s(?:usd|us\$|\$|dollars?)(?=[\s,.;]|$)/iu.test(texte) ? "USD" : /\s(?:htg|gourdes?)(?=[\s,.;]|$)/iu.test(texte) ? "HTG" : null;
    const net = texte.replace(/\s(?:usd|us\$|\$|dollars?|htg|gourdes?)(?=[\s,.;]|$)/giu, " ");
    const montant = (s: string) => {
      const m = /(\d[\d\s.,]*\s*(?:k|m|md|mds|millions?|milliards?)?)(?=[\s,;]|$)/iu.exec(s);
      return m ? lireMontant(m[1].trim()) : null;
    };
    const [avant, apres] = net.split(/\s(?:engag[ée]s?|d[ée]pens[ée]s?)(?=$|[\s:：])\s*[:：]?/iu);
    const seulEngage = /^\s*(?:budget\s+)?(?:engag|d[ée]pens)/iu.test(t);
    const prevu = seulEngage ? null : montant(avant.replace(/^\s*budget\s*(?:pr[ée]vu)?\s*[:：]?/iu, " "));
    const engage = apres !== undefined ? montant(apres) : seulEngage ? montant(avant.replace(/^\s*(?:budget\s+)?(?:engag[ée]s?|d[ée]pens[ée]s?)\s*[:：]?/iu, " ")) : null;
    const resume = `Budget : ${[prevu !== null ? `prévu ${montantTexte(prevu, devise ?? "HTG")}` : null, engage !== null ? `engagé ${montantTexte(engage, devise ?? "HTG")}` : null].filter(Boolean).join(", ") || "…"}`;
    // Sans montant, ce n'est pas le budget (« UR budget DTI à valider » est une tâche).
    if (prevu === null && engage === null) return null;
    return { commande: { type: "budget", prevu, engage, devise }, projet, resume };
  }
  const cl = /^cl[ôo]turer(?:\s+le\s+projet)?\s*(?:[:：]\s*(.*))?$/iu.exec(t);
  if (cl) {
    let texte = ` ${cl[1] ?? ""} `;
    let objectifs: Objectifs | null = null;
    const ob = /[\s,;(]+objectifs?\s+(atteints?|en\s+partie(?:\s+atteints?)?|partiellement(?:\s+atteints?)?|pas\s+atteints?|non\s+atteints?)\)?(?=$|[\s,;.])/iu.exec(texte);
    if (ob) {
      const v = cleNom(ob[1]);
      objectifs = /partie|partiel/.test(v) ? "en_partie" : /pas|non/.test(v) ? "non" : "oui";
      texte = `${texte.slice(0, ob.index)} ${texte.slice(ob.index + ob[0].length)}`;
    }
    const bilan = majuscule(sansPonctuationFin(espaces(texte))).slice(0, 4000);
    if (objectifs && bilan.length >= 10)
      return { commande: { type: "cloturer", bilan, objectifs }, projet, resume: `Clôturer le projet · objectifs ${LIBELLE_OBJECTIFS[objectifs].toLowerCase()} · bilan : « ${bilan} »` };
    return { commande: { type: "aller", lien: `/projets/${projet.id}?cloture=ouvrir#cloture` }, projet, resume: "Ouvrir le formulaire de clôture (bilan, objectifs, leçons apprises)" };
  }
  if (/^rouvrir(?:\s+le\s+projet)?$/iu.test(t)) return { commande: { type: "rouvrir" }, projet, resume: "Rouvrir le projet clôturé" };
  return null;
}

// ---------------------------------------------------------------------------
// L'entrée
// ---------------------------------------------------------------------------

/**
 * La phrase est-elle une action reconnue ? Renvoie null si ce n'en est pas une (c'est alors une tâche, une note,
 * une mise à jour de projet déjà connue, ou une recherche).
 */
export function analyserCommande(saisie: string, ctx: ContexteCommande, choisi: ProjetSaisie | null = null): AnalyseCommande | null {
  const brut = espaces(String(saisie ?? "").slice(0, 600));
  if (!brut) return null;
  // Sans projet : créer un projet, les rapports.
  const np = nouveauProjet(brut, ctx);
  if (np) return np;
  if (!choisi) {
    const r = rapports(brut, ctx);
    if (r) return r;
  }
  const { projet, reste } = projetDeLaPhrase(brut, ctx, choisi);
  const t = espaces(reste);
  if (!t) return null;
  const o: Avec = { projet, explicite: !!choisi };
  return livrable(t, ctx, o) ?? equipe(t, ctx, o) ?? decision(t, o) ?? risque(t, ctx, o) ?? phases(t, ctx, o) ?? champsProjet(t, ctx, o);
}

/** « charge de Myriam » (sans « ? ») : une question, si les mots désignent une seule personne. */
export function estQuestionCharge(saisie: string, personnes: Nomme[], moiId?: string): boolean {
  const m = /^\s*(?:quelle\s+est\s+)?(?:la\s+)?(?:charge|disponibilit[ée]s?)(?:\s+de\s+travail)?\s+(?:de|d['’]|du)\s*(.+?)\s*\??$/iu.exec(saisie);
  return !!m && !!personneNommee(m[1].replace(/\s+(?:cette\s+semaine|la\s+semaine\s+prochaine|semaine\s+prochaine)$/iu, ""), personnes, moiId);
}

// ---------------------------------------------------------------------------
// Ce que la barre sait faire : la liste qu'ouvre « > »
// ---------------------------------------------------------------------------

export type Permission = "tous" | "interne" | "gere" | "registres" | "redige" | "conseil" | "chef";
export type EntreeCatalogue = { cle: string; groupe: string; libelle: string; exemple: string; debut: string; projet: boolean; permis: Permission };

export const CATALOGUE: EntreeCatalogue[] = [
  { cle: "projet", groupe: "Projets", libelle: "Créer un projet", exemple: "Nouveau projet : Refonte du site : l'actuel ne s'affiche pas sur téléphone", debut: "Nouveau projet : ", projet: false, permis: "interne" },
  { cle: "livrable-nouveau", groupe: "Livrables", libelle: "Ajouter un livrable à un projet", exemple: "UR nouveau livrable maquettes validées 15/12 pour Daphnée", debut: "nouveau livrable ", projet: true, permis: "gere" },
  { cle: "livrable-assigner", groupe: "Livrables", libelle: "Assigner un livrable", exemple: "UR assigner le livrable audit à Daphnée", debut: "assigner le livrable ", projet: true, permis: "gere" },
  { cle: "livrable-date", groupe: "Livrables", libelle: "Changer la date d'un livrable", exemple: "UR livrable audit 20/11", debut: "livrable ", projet: true, permis: "gere" },
  { cle: "livrable-pret", groupe: "Livrables", libelle: "Déclarer un livrable prêt à valider", exemple: "UR livrable audit prêt", debut: "livrable ", projet: true, permis: "tous" },
  { cle: "livrable-valider", groupe: "Livrables", libelle: "Valider un livrable", exemple: "UR valider le livrable audit", debut: "valider le livrable ", projet: true, permis: "gere" },
  { cle: "livrable-renvoyer", groupe: "Livrables", libelle: "Renvoyer un livrable à reprendre", exemple: "UR renvoyer le livrable audit : compléter le point 6", debut: "renvoyer le livrable ", projet: true, permis: "gere" },
  { cle: "equipe", groupe: "Projets", libelle: "Ajouter quelqu'un à l'équipe", exemple: "UR ajouter Fabienne à l'équipe comme analyste", debut: "ajouter ", projet: true, permis: "gere" },
  { cle: "chef", groupe: "Projets", libelle: "Changer de chef de projet", exemple: "UR chef de projet Daphnée Joseph", debut: "chef de projet ", projet: true, permis: "gere" },
  { cle: "sponsor", groupe: "Projets", libelle: "Nommer le sponsor métier", exemple: "UR sponsor Frantz Desrosiers", debut: "sponsor ", projet: true, permis: "gere" },
  { cle: "priorite", groupe: "Projets", libelle: "Priorité du projet", exemple: "UR priorité haute", debut: "priorité ", projet: true, permis: "gere" },
  { cle: "fin", groupe: "Projets", libelle: "Repousser la fin prévue", exemple: "UR fin prévue 20/12 : la DTI livre le serveur en retard", debut: "fin prévue ", projet: true, permis: "gere" },
  { cle: "lancement", groupe: "Projets", libelle: "Date de lancement", exemple: "UR lancement 15/01", debut: "lancement ", projet: true, permis: "gere" },
  { cle: "budget", groupe: "Projets", libelle: "Budget prévu et engagé", exemple: "UR budget 12,5 M engagé 11,8 M", debut: "budget ", projet: true, permis: "gere" },
  { cle: "decision", groupe: "Projets", libelle: "Noter une décision prise", exemple: "UR décision prise : mise en ligne en deux vagues (comité de pilotage)", debut: "décision prise : ", projet: true, permis: "registres" },
  { cle: "risque", groupe: "Risques", libelle: "Ajouter un risque au registre", exemple: "UR nouveau risque : retard du prestataire, probable, impact fort", debut: "nouveau risque : ", projet: true, permis: "registres" },
  { cle: "risque-maitrise", groupe: "Risques", libelle: "Marquer un risque maîtrisé ou clos", exemple: "UR risque prestataire maîtrisé", debut: "risque ", projet: true, permis: "registres" },
  { cle: "risque-signal", groupe: "Risques", libelle: "Signaler un risque (santé du projet)", exemple: "UR risque : le prestataire ne livre pas", debut: "risque : ", projet: true, permis: "gere" },
  { cle: "phase", groupe: "Phases", libelle: "Terminer la phase en cours", exemple: "UR terminer la phase", debut: "terminer la phase", projet: true, permis: "gere" },
  { cle: "phases-types", groupe: "Phases", libelle: "Découper un projet en phases types", exemple: "UR phases types", debut: "phases types", projet: true, permis: "gere" },
  { cle: "phase-nouvelle", groupe: "Phases", libelle: "Ajouter une phase", exemple: "UR nouvelle phase pilote en agence du 2/11 au 30/11", debut: "nouvelle phase ", projet: true, permis: "gere" },
  { cle: "cloturer", groupe: "Projets", libelle: "Clôturer un projet", exemple: "UR clôturer : en ligne pour tous les clients, objectifs atteints", debut: "clôturer : ", projet: true, permis: "gere" },
  { cle: "rouvrir", groupe: "Projets", libelle: "Rouvrir un projet clôturé", exemple: "UR rouvrir", debut: "rouvrir", projet: true, permis: "gere" },
  { cle: "tache", groupe: "Tâches", libelle: "Créer une tâche", exemple: "Relire les maquettes UR pour Fabienne vendredi 2h priorité haute", debut: "", projet: false, permis: "tous" },
  { cle: "tache-maj", groupe: "Tâches", libelle: "Mettre une tâche à jour", exemple: "# puis : faite · bloquée … · 15/11 · priorité haute · passé 1h30 · répéter chaque lundi · annuler : …", debut: "#", projet: false, permis: "tous" },
  { cle: "reunion", groupe: "Tâches", libelle: "Noter une réunion", exemple: "Réunion comité de pilotage UR jeudi 10h avec Myriam", debut: "Réunion ", projet: false, permis: "tous" },
  { cle: "note", groupe: "Rapports", libelle: "Ajouter une note au rapport du vendredi", exemple: "Décision : valider le budget DTI UR", debut: "Décision : ", projet: false, permis: "redige" },
  { cle: "rapport-envoyer", groupe: "Rapports", libelle: "Envoyer mon rapport de la semaine", exemple: "envoyer mon rapport", debut: "envoyer mon rapport", projet: false, permis: "redige" },
  { cle: "rapport-generer", groupe: "Rapports", libelle: "Générer un rapport", exemple: "générer un rapport", debut: "générer un rapport", projet: false, permis: "tous" },
  { cle: "conseil", groupe: "Rapports", libelle: "Rapport au conseil (ou en Word)", exemple: "rapport au conseil en Word", debut: "rapport au conseil", projet: false, permis: "conseil" },
  { cle: "ponctuel", groupe: "Rapports", libelle: "Rapport ponctuel au conseil", exemple: "rapport ponctuel : point sur UNIBANKOnline : pour le conseil du 15", debut: "rapport ponctuel : ", projet: false, permis: "conseil" },
  { cle: "charge", groupe: "Questions", libelle: "Charge d'une personne", exemple: "charge de Myriam", debut: "charge de ", projet: false, permis: "chef" },
  { cle: "questions", groupe: "Questions", libelle: "Poser une question", exemple: "en retard sur UR ? · qui est surchargé ? · projets à surveiller ?", debut: "", projet: false, permis: "tous" },
  { cle: "ecrans", groupe: "Écrans", libelle: "Aller à un écran", exemple: "Gantt UR · calendrier CR · rapports de Fabienne", debut: "", projet: false, permis: "tous" },
];

/** Les entrées du catalogue qui correspondent aux mots tapés après « > ». */
export function chercherCatalogue(requete: string, permis: (p: Permission) => boolean): EntreeCatalogue[] {
  const mots = cleNom(requete).split(" ").filter(Boolean);
  return CATALOGUE.filter((e) => permis(e.permis) && mots.every((m) => cleNom(`${e.groupe} ${e.libelle} ${e.exemple}`).includes(m)));
}
