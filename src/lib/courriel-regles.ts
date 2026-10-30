/**
 * Rappels du vendredi par courriel, et courriel du lundi : quand en envoyer un, et ce qu'il dit. Pur (sans base
 * ni réseau) ; testé dans tests/courriels.test.ts.
 *
 * Deux courriels au plus par personne et par semaine :
 * - « prêt à relire » à l'heure « prêt » du modèle de rapport ;
 * - « rappel » à l'heure de rappel du modèle, seulement si le rapport n'est pas parti.
 * Si les deux sont dus au même passage (serveur arrêté entre-temps), seul le rappel part. Un modèle sans
 * heure de rappel n'envoie que « prêt à relire ». Rien la nuit (avant 7 h, après 20 h) : le courriel
 * attend le matin. Le courriel ne contient rien du rapport : un lien vers la page, c'est tout.
 */
import { texteMoment, type EtapeRapport, type Horaires } from "@/lib/modeles";

export type TypeRappel = "rapport_pret" | "rapport_rappel";

/** Heures où l'on peut écrire à quelqu'un (heure locale de la division). */
export const HEURES_ENVOI = { debut: 7 * 60, fin: 20 * 60 };

export function courrielDu(
  etape: EtapeRapport,
  o: { rapportEnvoye: boolean; avecRappel: boolean; deja: ReadonlySet<string>; minutes: number },
): TypeRappel | null {
  if (o.rapportEnvoye || etape === "en_preparation") return null;
  if (o.minutes < HEURES_ENVOI.debut || o.minutes >= HEURES_ENVOI.fin) return null;
  if (etape === "pret") return o.deja.has("rapport_pret") || o.deja.has("rapport_rappel") ? null : "rapport_pret";
  // Heure de rappel passée (ou heure limite) : le rappel, si le modèle en prévoit un.
  if (!o.avecRappel) return o.deja.has("rapport_pret") || o.deja.has("rapport_rappel") || etape === "en_retard" ? null : "rapport_pret";
  return o.deja.has("rapport_rappel") ? null : "rapport_rappel";
}

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Courriel de rappel : sujet, texte brut et HTML simple (styles en ligne, un bouton). */
export function messageRappel(
  type: TypeRappel,
  o: { prenom: string; semaine: string; horaires: Horaires; enRetard: boolean; lien: string },
): { sujet: string; texte: string; html: string } {
  const limite = o.horaires.limite ? texteMoment(o.horaires.limite, o.semaine) : null;
  const sujet =
    type === "rapport_pret"
      ? "Votre rapport de la semaine est prêt à relire"
      : o.enRetard
        ? "Votre rapport de la semaine n'est pas encore parti"
        : `Rappel : votre rapport est à envoyer${limite ? ` avant ${limite}` : ""}`;
  const corps =
    type === "rapport_pret"
      ? [
          "Votre rapport de la semaine est prêt : il est déjà rempli avec vos tâches de la semaine.",
          `Il ne reste qu'à le relire, à compléter ce qui manque et à l'envoyer${limite ? ` avant ${limite}` : ""}.`,
        ]
      : [
          o.enRetard ? "Votre rapport de la semaine n'est pas encore parti." : `Votre rapport de la semaine n'est pas encore parti${limite ? ` ; il est attendu avant ${limite}` : ""}.`,
          "Il est déjà rempli avec vos tâches : quelques minutes suffisent pour le relire et l'envoyer.",
        ];
  const salutation = `Bonjour ${o.prenom.trim() || ""}`.trim() + ",";
  const pied = "Pilotage des projets, Division des Projets Organisationnels. Courriel envoyé automatiquement : inutile d'y répondre.";
  const texte = [salutation, "", ...corps, "", `Ouvrir mon rapport : ${o.lien}`, "", "—", pied].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f7f6f2;font-family:Arial,Helvetica,sans-serif;color:#0b3156">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e2d8">
<tr><td style="padding:20px 24px;background:#0b3156;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase">Pilotage des projets</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:22px">
<p style="margin:0 0 16px">${echapper(salutation)}</p>
${corps.map((p) => `<p style="margin:0 0 12px">${echapper(p)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${echapper(o.lien)}" style="display:inline-block;padding:12px 20px;background:#f4b22d;color:#0b3156;font-weight:bold;text-decoration:none">Ouvrir mon rapport</a></p>
<p style="margin:0;font-size:12px;line-height:18px;color:#6b6862">${echapper(pied)}</p>
</td></tr></table></body></html>`;
  return { sujet, texte, html };
}

export type ConfigSmtp = {
  hote: string;
  port: number;
  /** implicite : TLS dès la connexion (port 465) ; starttls : passage obligatoire en TLS ; aucun : relais interne sans TLS. */
  tls: "implicite" | "starttls" | "aucun";
  utilisateur: string | null;
  motDePasse: string | null;
  expediteur: string;
  ca: string | null;
};

/** Lit SMTP_* : null si le courriel n'est pas configuré (rien ne part), ou l'erreur de configuration. */
export function lireConfigSmtp(env: Record<string, string | undefined>): { config: ConfigSmtp } | { erreur: string } | null {
  const hote = (env.SMTP_HOTE ?? "").trim();
  if (!hote) return null;
  const expediteur = (env.SMTP_EXPEDITEUR ?? "").trim();
  if (!/^[^\r\n<>]*<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/.test(expediteur)) return { erreur: "SMTP_EXPEDITEUR manquant ou illisible (ex. : Pilotage des projets <pilotage@unibankhaiti.com>)." };
  const tls = (env.SMTP_TLS ?? "starttls").trim().toLowerCase();
  if (tls !== "implicite" && tls !== "starttls" && tls !== "aucun") return { erreur: "SMTP_TLS : implicite, starttls ou aucun." };
  const port = Number(env.SMTP_PORT || (tls === "implicite" ? 465 : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { erreur: "SMTP_PORT illisible." };
  const utilisateur = (env.SMTP_UTILISATEUR ?? "").trim() || null;
  const motDePasse = env.SMTP_MOT_DE_PASSE || null;
  if (utilisateur && !motDePasse) return { erreur: "SMTP_MOT_DE_PASSE manquant pour SMTP_UTILISATEUR." };
  // Jamais de mot de passe en clair sur le réseau.
  if (utilisateur && tls === "aucun") return { erreur: "Avec un compte SMTP, le TLS est obligatoire (SMTP_TLS=starttls ou implicite)." };
  return { config: { hote, port, tls, utilisateur, motDePasse, expediteur, ca: (env.SMTP_CA ?? "").trim() || null } };
}

// ---------------------------------------------------------------------------
// Courriel du lundi (29 octobre 2026) : pour qui l'a demandé dans son profil
// ---------------------------------------------------------------------------

/** Le lundi, de 7 h à midi : après, il attendrait le lundi suivant (il ne sert plus à rien en fin de journée). */
export const HEURES_LUNDI = { debut: 7 * 60, fin: 12 * 60 };

export function estMomentDuLundi(m: { jour: string; minutes: number }): boolean {
  return new Date(`${m.jour}T12:00:00Z`).getUTCDay() === 1 && m.minutes >= HEURES_LUNDI.debut && m.minutes < HEURES_LUNDI.fin;
}

export type LigneLundi = { titre: string; jour: string; code?: string | null; heure?: string | null };

const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const jourCourt = (jour: string) => `${JOURS_COURTS[new Date(`${jour}T12:00:00Z`).getUTCDay()]} ${Number(jour.slice(8))}`;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const jourMois = (jour: string) => `${Number(jour.slice(8)) === 1 ? "1er" : Number(jour.slice(8))} ${MOIS[Number(jour.slice(5, 7)) - 1]}`;
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const MAX_LIGNES = 10;

/**
 * Le courriel du lundi : les tâches en retard, les échéances de la semaine et les réunions. `detail` « titres »
 * (par défaut) les nomme ; « nombres » ne donne que les nombres, si la conformité préfère qu'aucun titre ne parte
 * par courriel (COURRIEL_LUNDI=nombres). null quand il n'y a rien à dire : pas de courriel vide.
 */
export function messageLundi(o: {
  prenom: string;
  lundi: string;
  retards: LigneLundi[];
  echeances: LigneLundi[];
  reunions: LigneLundi[];
  detail: "titres" | "nombres";
  lien: string;
}): { sujet: string; texte: string; html: string } | null {
  const n = { retards: o.retards.length, echeances: o.echeances.length, reunions: o.reunions.length };
  if (!n.retards && !n.echeances && !n.reunions) return null;
  const resume = [
    n.echeances ? pluriel(n.echeances, "échéance", "échéances") : null,
    n.retards ? pluriel(n.retards, "tâche en retard", "tâches en retard") : null,
    n.reunions ? pluriel(n.reunions, "réunion", "réunions") : null,
  ].filter(Boolean) as string[];
  const sujet = `Votre semaine du ${jourMois(o.lundi)} : ${resume.join(", ")}`;
  const ligne = (l: LigneLundi, avecHeure: boolean) => `${jourCourt(l.jour)}${avecHeure && l.heure ? ` à ${l.heure.replace(":", " h ").replace(" h 00", " h")}` : ""} · ${l.code ? `${l.code} · ` : ""}${l.titre}`;
  const sections: { titre: string; lignes: string[] }[] = [];
  const ajouter = (titre: string, liste: LigneLundi[], avecHeure: boolean) => {
    if (!liste.length) return;
    const lignes = o.detail === "titres" ? liste.slice(0, MAX_LIGNES).map((l) => ligne(l, avecHeure)) : [];
    if (o.detail === "titres" && liste.length > MAX_LIGNES) lignes.push(`… et ${liste.length - MAX_LIGNES} de plus dans l'application.`);
    sections.push({ titre: `${titre} · ${liste.length}`, lignes });
  };
  ajouter("En retard", o.retards, false);
  ajouter("À rendre cette semaine", o.echeances, false);
  ajouter("Réunions", o.reunions, true);
  const salutation = `Bonjour ${o.prenom.trim() || ""}`.trim() + ",";
  const intro = `Voici votre semaine : ${resume.join(", ")}.`;
  const pied = "Pilotage des projets, Division des Projets Organisationnels. Vous recevez ce courriel parce que vous l'avez demandé dans votre profil ; vous pouvez l'arrêter au même endroit.";
  const texte = [salutation, "", intro, "", ...sections.flatMap((s) => [s.titre, ...s.lignes.map((l) => `  - ${l}`), ""]), `Ouvrir ma semaine : ${o.lien}`, "", "—", pied].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f7f6f2;font-family:Arial,Helvetica,sans-serif;color:#0b3156">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e2d8">
<tr><td style="padding:20px 24px;background:#0b3156;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase">Pilotage des projets · votre semaine</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:22px">
<p style="margin:0 0 16px">${echapper(salutation)}</p>
<p style="margin:0 0 16px">${echapper(intro)}</p>
${sections
  .map(
    (s) =>
      `<p style="margin:16px 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b6862">${echapper(s.titre)}</p>${
        s.lignes.length ? `<ul style="margin:0;padding:0 0 0 18px">${s.lignes.map((l) => `<li style="margin:0 0 4px">${echapper(l)}</li>`).join("")}</ul>` : ""
      }`,
  )
  .join("\n")}
<p style="margin:24px 0"><a href="${echapper(o.lien)}" style="display:inline-block;padding:12px 20px;background:#f4b22d;color:#0b3156;font-weight:bold;text-decoration:none">Ouvrir ma semaine</a></p>
<p style="margin:0;font-size:12px;line-height:18px;color:#6b6862">${echapper(pied)}</p>
</td></tr></table></body></html>`;
  return { sujet, texte, html };
}
