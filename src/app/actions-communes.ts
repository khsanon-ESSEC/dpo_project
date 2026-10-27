"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fermerSession, utilisateurCourant } from "@/lib/auth/session";
import { noter } from "@/lib/journal";

export async function choisirTheme(theme: "clair" | "sombre" | "auto") {
  if (!["clair", "sombre", "auto"].includes(theme)) return;
  (await cookies()).set("dpo_theme", theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  const u = await utilisateurCourant();
  if (u) await db.update(schema.personnes).set({ theme }).where(eq(schema.personnes.id, u.id));
}

export async function seDeconnecter() {
  const u = await utilisateurCourant();
  await fermerSession();
  if (u) await noter(u.id, "deconnexion");
  redirect("/connexion");
}
