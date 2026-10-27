"use server";

import { redirect } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { relancer } from "@/lib/donnees/equipe";
import { noter } from "@/lib/journal";

export async function relancerEquipe(form: FormData) {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const ids = form.getAll("personneId").map(String);
  const n = await relancer(a, ids);
  await noter(u.id, "relance", null, { personnes: n });
  redirect("/equipe?relance=1");
}
