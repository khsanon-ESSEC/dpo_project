/**
 * Envoi de courriels par le serveur SMTP de la banque (SMTP_*). Sans SMTP_HOTE, rien ne part et
 * l'application fonctionne comme avant (les alertes dans l'application restent).
 * TLS 1.2 au moins ; le certificat du serveur est toujours vérifié (autorité de la banque dans SMTP_CA si
 * elle n'est pas dans le magasin du système).
 */
import "server-only";
import { readFileSync } from "node:fs";
import { createTransport } from "nodemailer";
import { lireConfigSmtp, type ConfigSmtp } from "@/lib/courriel-regles";

export type Courriel = { a: string; sujet: string; texte: string; html: string };
export type Expediteur = (c: Courriel) => Promise<void>;

let transport: ReturnType<typeof createTransport> | null = null;
let configLue: { config: ConfigSmtp } | { erreur: string } | null | undefined;

function config() {
  if (configLue === undefined) {
    configLue = lireConfigSmtp(process.env);
    if (configLue && "erreur" in configLue) console.error("courriel : configuration SMTP refusée :", configLue.erreur);
  }
  return configLue && "config" in configLue ? configLue.config : null;
}

/** Le courriel est-il configuré (et APP_URL connu, pour les liens) ? */
export function courrielActif(): boolean {
  return !!config() && !!process.env.APP_URL;
}

function leTransport() {
  const c = config();
  if (!c) throw new Error("Courriel non configuré (SMTP_HOTE).");
  if (!transport) {
    transport = createTransport({
      host: c.hote,
      port: c.port,
      secure: c.tls === "implicite",
      requireTLS: c.tls === "starttls",
      ignoreTLS: c.tls === "aucun",
      auth: c.utilisateur ? { user: c.utilisateur, pass: c.motDePasse ?? "" } : undefined,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, ...(c.ca ? { ca: readFileSync(c.ca) } : {}) },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transport;
}

export const envoyerCourriel: Expediteur = async ({ a, sujet, texte, html }) => {
  const c = config();
  if (!c) throw new Error("Courriel non configuré (SMTP_HOTE).");
  await leTransport().sendMail({ from: c.expediteur, to: a, subject: sujet, text: texte, html, headers: { "Auto-Submitted": "auto-generated" } });
};
