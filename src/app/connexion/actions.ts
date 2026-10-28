"use server";

import { redirect } from "next/navigation";
import { connecterIdentiteVerifiee, verifierIdentifiants } from "@/lib/auth/session";
import { adActive, verifierAD } from "@/lib/auth/ad";
import { MESSAGES_AD } from "@/lib/auth/ad-regles";
import { noter } from "@/lib/journal";

/** `courriel` revient avec l'erreur pour ne pas avoir à le retaper (le formulaire se vide après chaque envoi). */
export type EtatConnexion = { message: string | null; courriel?: string };

export async function seConnecter(_: EtatConnexion, form: FormData): Promise<EtatConnexion> {
  const courriel = String(form.get("courriel") ?? "").trim().slice(0, 200);
  const r = await verifierIdentifiants(courriel, String(form.get("motDePasse") ?? ""));
  if (!r.ok) return { message: r.message, courriel };
  redirect("/semaine");
}

export type EtatConnexionAD = { message: string | null; identifiant?: string };

/** Connexion avec le compte Windows de la banque (Active Directory). Le mot de passe n'est ni gardé ni noté. */
export async function seConnecterAD(_: EtatConnexionAD, form: FormData): Promise<EtatConnexionAD> {
  if (!adActive()) return { message: MESSAGES_AD.indisponible };
  const saisie = String(form.get("identifiant") ?? "").trim().slice(0, 200);
  const r = await verifierAD(saisie, form.get("motDePasse"));
  if (!r.ok) {
    await noter(null, "connexion_refusee", r.identifiant ?? saisie.slice(0, 80), { methode: "ad", raison: r.refus });
    return { message: MESSAGES_AD[r.refus], identifiant: saisie };
  }
  const c = await connecterIdentiteVerifiee(r.courriel, "ad", { identifiant: r.identifiant });
  if (!c.ok) return { message: MESSAGES_AD.sans_acces, identifiant: saisie };
  redirect("/semaine");
}
