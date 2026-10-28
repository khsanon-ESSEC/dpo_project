"use server";

import { revalidatePath } from "next/cache";
import { exigerInterne } from "@/lib/auth/session";
import { adActive, lireAnnuaire } from "@/lib/auth/ad";
import { MESSAGES_AD } from "@/lib/auth/ad-regles";
import { appliquerImport, planPourLignes } from "@/lib/donnees/import-organisation";
import { lireLignes, type LigneImport, type Plan } from "@/lib/import-organisation";
import { noter } from "@/lib/journal";
import { peutAdministrer } from "@/lib/regles";
import { decoderTexte, ErreurTableur, LIMITES, lireCsv, lireXlsx } from "@/lib/tableur";

export type EtatImport = {
  message: string | null;
  ok?: boolean;
  plan?: Plan;
  lignes?: LigneImport[];
  source?: "fichier" | "annuaire";
  nomFichier?: string;
  sansAdresse?: number;
  /** Rendus au formulaire de l'annuaire (il se vide après chaque envoi) ; jamais le mot de passe. */
  identifiant?: string;
  ou?: string;
};

async function exigerAdministrateur() {
  const u = await exigerInterne();
  if (!peutAdministrer(u)) throw new Error("Réservé aux administrateurs.");
  return u;
}

/** Fichier Excel (.xlsx) ou CSV : lu, puis comparé à l'organisation actuelle. Rien n'est encore modifié. */
export async function previsualiserFichier(_: EtatImport, form: FormData): Promise<EtatImport> {
  await exigerAdministrateur();
  const f = form.get("fichier");
  if (!(f instanceof File) || f.size === 0) return { message: "Choisissez un fichier Excel (.xlsx) ou CSV." };
  if (f.size > LIMITES.octets) return { message: "Fichier trop lourd (2 Mo au plus)." };
  const nom = f.name.slice(0, 120);
  const octets = new Uint8Array(await f.arrayBuffer());
  const zip = octets[0] === 0x50 && octets[1] === 0x4b; // « PK » : un .xlsx est une archive zip
  if (/\.xls$/i.test(nom) || (octets[0] === 0xd0 && octets[1] === 0xcf)) return { message: "Ancien format Excel (.xls) : enregistrez le fichier en .xlsx (Fichier › Enregistrer sous)." };
  try {
    const tableau = zip ? lireXlsx(octets) : lireCsv(decoderTexte(octets));
    const r = lireLignes(tableau);
    if ("erreur" in r) return { message: r.erreur };
    return { message: null, plan: await planPourLignes(r.lignes), lignes: r.lignes, source: "fichier", nomFichier: nom };
  } catch (e) {
    if (e instanceof ErreurTableur) return { message: e.message };
    console.error("import : lecture du fichier :", (e as Error).message);
    return { message: "Fichier illisible : enregistrez-le en .xlsx ou en CSV, puis réessayez." };
  }
}

/** Active Directory : l'administrateur se lie avec son compte Windows (le mot de passe n'est ni gardé ni noté). */
export async function previsualiserAnnuaire(_: EtatImport, form: FormData): Promise<EtatImport> {
  const u = await exigerAdministrateur();
  const identifiant = String(form.get("identifiant") ?? "").slice(0, 200);
  const ou = String(form.get("ou") ?? "").slice(0, 500);
  if (!adActive()) return { message: MESSAGES_AD.indisponible, identifiant, ou };
  const r = await lireAnnuaire(identifiant, form.get("motDePasse"), { ou, equipeDepuisService: form.get("service") === "on" });
  if (!r.ok) {
    await noter(u.id, "annuaire_refuse", null, { raison: r.refus });
    return { message: r.refus === "perimetre" ? "Indiquez une unité d'organisation sous la base de l'annuaire (ex. : OU=DPO,DC=unibank,DC=local)." : MESSAGES_AD[r.refus], identifiant, ou };
  }
  await noter(u.id, "annuaire_lu", null, { comptes: r.lignes.length, sansAdresse: r.sansAdresse });
  if (!r.lignes.length) return { message: "Aucun compte actif trouvé dans ce périmètre.", identifiant, ou };
  return { message: null, plan: await planPourLignes(r.lignes, "annuaire"), lignes: r.lignes, source: "annuaire", sansAdresse: r.sansAdresse, identifiant, ou };
}

/** Lignes renvoyées par la page : reprises champ par champ, le plan est recalculé à l'application. */
function lignesRecues(brut: unknown): LigneImport[] | null {
  let v: unknown;
  try {
    v = JSON.parse(String(brut ?? ""));
  } catch {
    return null;
  }
  if (!Array.isArray(v) || v.length === 0 || v.length > 2000) return null;
  const t = (x: unknown, n: number) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  // Numéros de ligne : ceux du fichier s'ils sont tous distincts (pour les messages), sinon renumérotés.
  const numeros = v.map((l: Record<string, unknown>) => (Number.isInteger(l?.ligne) && Number(l.ligne) > 0 ? Number(l.ligne) : null));
  const fiables = numeros.every((n) => n !== null) && new Set(numeros).size === numeros.length;
  return v.map((l: Record<string, unknown>, i) => ({
    ligne: fiables ? numeros[i]! : i + 2,
    prenom: t(l?.prenom, 101),
    nom: t(l?.nom, 101),
    courriel: t(l?.courriel, 201).toLowerCase(),
    poste: t(l?.poste, 151),
    equipe: t(l?.equipe, 101),
    superieur: t(l?.superieur, 201).toLowerCase(),
  }));
}

export async function importer(_: EtatImport, form: FormData): Promise<EtatImport> {
  const u = await exigerAdministrateur();
  const lignes = lignesRecues(form.get("lignes"));
  const source = form.get("source") === "annuaire" ? "annuaire" : "fichier";
  if (!lignes) return { message: "Rien à importer : prévisualisez d'abord un fichier ou l'annuaire." };
  const r = await appliquerImport(u.id, lignes, source);
  if (!r.ok) return { message: r.refus ?? "L'organisation a changé entre-temps : voici la nouvelle comparaison, corrigez puis recommencez.", plan: r.plan, lignes, source };
  revalidatePath("/", "layout");
  const p = r.plan;
  const morceaux = [
    p.creer.length ? `${p.creer.length} personne${p.creer.length > 1 ? "s" : ""} ajoutée${p.creer.length > 1 ? "s" : ""}` : null,
    p.modifier.length ? `${p.modifier.length} mise${p.modifier.length > 1 ? "s" : ""} à jour` : null,
    p.equipesNouvelles.length ? `${p.equipesNouvelles.length} équipe${p.equipesNouvelles.length > 1 ? "s" : ""} créée${p.equipesNouvelles.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return { ok: true, message: morceaux.length ? `Import fait : ${morceaux.join(", ")}.` : "Rien n'a changé : l'organisation était déjà à jour." };
}
