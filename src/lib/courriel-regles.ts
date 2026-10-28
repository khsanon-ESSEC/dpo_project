/**
 * Rappels du vendredi par courriel : quand en envoyer un, et ce qu'il dit. Pur (sans base ni réseau) ;
 * testé dans tests/courriels.test.ts.
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
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f7f6f2;font-family:Arial,Helvetica,sans-serif;color:#142458">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e2d8">
<tr><td style="padding:20px 24px;background:#142458;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase">Pilotage des projets</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:22px">
<p style="margin:0 0 16px">${echapper(salutation)}</p>
${corps.map((p) => `<p style="margin:0 0 12px">${echapper(p)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${echapper(o.lien)}" style="display:inline-block;padding:12px 20px;background:#f4b22d;color:#142458;font-weight:bold;text-decoration:none">Ouvrir mon rapport</a></p>
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
