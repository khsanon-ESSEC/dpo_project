"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import { db, schema } from "@/db";
import { exigerUtilisateur, fermerAutresSessions, hacherMotDePasse, motDePasseAcceptable } from "@/lib/auth/session";
import { noter } from "@/lib/journal";

export type EtatMotDePasse = { message: string | null };

export async function changerMotDePasse(_: EtatMotDePasse, form: FormData): Promise<EtatMotDePasse> {
  const u = await exigerUtilisateur();
  const actuel = String(form.get("actuel") ?? "");
  const nouveau = String(form.get("nouveau") ?? "");
  const confirmation = String(form.get("confirmation") ?? "");
  const [p] = await db.select({ hash: schema.personnes.motDePasseHash }).from(schema.personnes).where(eq(schema.personnes.id, u.id));
  if (!p?.hash || !(await verify(p.hash, actuel).catch(() => false))) return { message: "Le mot de passe actuel ne correspond pas." };
  const probleme = motDePasseAcceptable(nouveau);
  if (probleme) return { message: probleme };
  if (nouveau !== confirmation) return { message: "Les deux saisies du nouveau mot de passe diffèrent." };
  if (nouveau === actuel) return { message: "Choisissez un mot de passe différent de l'actuel." };
  await db.update(schema.personnes).set({ motDePasseHash: await hacherMotDePasse(nouveau), doitChangerMotDePasse: false }).where(eq(schema.personnes.id, u.id));
  await fermerAutresSessions(u.id);
  await noter(u.id, "mot_de_passe_change");
  redirect("/semaine");
}
