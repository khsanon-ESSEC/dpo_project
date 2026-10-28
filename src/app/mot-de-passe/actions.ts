"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigerUtilisateur, fermerAutresSessions, hacherMotDePasse, motDePasseAcceptable, verifierMotDePasseDe } from "@/lib/auth/session";
import { noter } from "@/lib/journal";

export type EtatMotDePasse = { message: string | null };

export async function changerMotDePasse(_: EtatMotDePasse, form: FormData): Promise<EtatMotDePasse> {
  const u = await exigerUtilisateur({ provisoireAccepte: true });
  const actuel = String(form.get("actuel") ?? "");
  const nouveau = String(form.get("nouveau") ?? "");
  const confirmation = String(form.get("confirmation") ?? "");
  const verifie = await verifierMotDePasseDe(u.id, actuel);
  if (verifie === "bloque") return { message: "Trop d'essais. Réessayez dans 15 minutes." };
  if (verifie !== "ok") return { message: "Le mot de passe actuel ne correspond pas." };
  const probleme = motDePasseAcceptable(nouveau);
  if (probleme) return { message: probleme };
  if (nouveau !== confirmation) return { message: "Les deux saisies du nouveau mot de passe diffèrent." };
  if (nouveau === actuel) return { message: "Choisissez un mot de passe différent de l'actuel." };
  await db.update(schema.personnes).set({ motDePasseHash: await hacherMotDePasse(nouveau), doitChangerMotDePasse: false }).where(eq(schema.personnes.id, u.id));
  await fermerAutresSessions(u.id);
  await noter(u.id, "mot_de_passe_change");
  redirect("/semaine");
}
