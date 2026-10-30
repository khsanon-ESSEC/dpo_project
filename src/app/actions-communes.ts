"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fermerSession, utilisateurActif, utilisateurCourant } from "@/lib/auth/session";
import { noter } from "@/lib/journal";
import { noterConsultation } from "@/lib/donnees/pilote";

export async function choisirTheme(theme: "clair" | "sombre" | "auto") {
  if (!["clair", "sombre", "auto"].includes(theme)) return;
  (await cookies()).set("dpo_theme", theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  const u = await utilisateurCourant();
  if (u) await db.update(schema.personnes).set({ theme }).where(eq(schema.personnes.id, u.id));
}

/** Le courriel du lundi matin (échéances, retards, réunions de la semaine) : seulement si la personne le demande. */
export async function choisirCourrielLundi(actif: boolean) {
  const u = await utilisateurCourant();
  if (!u || typeof actif !== "boolean") return;
  await db.update(schema.personnes).set({ courrielLundi: actif }).where(eq(schema.personnes.id, u.id));
  await noter(u.id, actif ? "courriel_lundi_demande" : "courriel_lundi_arrete");
}

export async function seDeconnecter() {
  const u = await utilisateurCourant();
  await fermerSession();
  if (u) await noter(u.id, "deconnexion");
  redirect("/connexion");
}

/** Suivi du pilote : l'écran ouvert est noté (une fois par jour et par personne), sans rien d'autre. */
export async function consultation(chemin: string) {
  const u = await utilisateurActif();
  if (!u || typeof chemin !== "string") return;
  await noterConsultation(u.id, chemin).catch(() => {});
}
