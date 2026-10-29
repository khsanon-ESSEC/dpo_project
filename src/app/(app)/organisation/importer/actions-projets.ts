"use server";

import { revalidatePath } from "next/cache";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { appliquerImportProjets, appliquerImportTaches, peutImporterProjets, planImportProjets, planImportTaches, type PlanProjets, type PlanTaches } from "@/lib/donnees/import-projets";
import { COLONNES_PROJETS, COLONNES_TACHES, lireTableau, type Colonne, type LigneBrute } from "@/lib/import-projets";
import { decoderTexte, ErreurTableur, LIMITES, lireCsv, lireXlsx } from "@/lib/tableur";

export type EtatImportProjets = { message: string | null; ok?: boolean; nomFichier?: string; lignes?: LigneBrute[]; projets?: PlanProjets; taches?: PlanTaches };

async function exigerImport() {
  const u = await exigerInterne();
  const a = await acces(u);
  if (!peutImporterProjets(a)) throw new Error("Réservé aux exécutifs.");
  return a;
}

/** Le fichier déposé (.xlsx ou CSV), lu en lignes ; rien n'est encore écrit. */
async function lireFichier(form: FormData, colonnes: Colonne[], obligatoire: string): Promise<{ lignes: LigneBrute[]; nom: string } | { message: string }> {
  const f = form.get("fichier");
  if (!(f instanceof File) || f.size === 0) return { message: "Choisissez un fichier Excel (.xlsx) ou CSV." };
  if (f.size > LIMITES.octets) return { message: "Fichier trop lourd (2 Mo au plus)." };
  const nom = f.name.slice(0, 120);
  const octets = new Uint8Array(await f.arrayBuffer());
  if (/\.xls$/i.test(nom) || (octets[0] === 0xd0 && octets[1] === 0xcf)) return { message: "Ancien format Excel (.xls) : enregistrez le fichier en .xlsx (Fichier › Enregistrer sous)." };
  try {
    const tableau = octets[0] === 0x50 && octets[1] === 0x4b ? lireXlsx(octets) : lireCsv(decoderTexte(octets));
    const r = lireTableau(tableau, colonnes, obligatoire);
    return "erreur" in r ? { message: r.erreur } : { lignes: r.lignes, nom };
  } catch (e) {
    if (e instanceof ErreurTableur) return { message: e.message };
    console.error("import : lecture du fichier :", (e as Error).message);
    return { message: "Fichier illisible : enregistrez-le en .xlsx ou en CSV, puis réessayez." };
  }
}

/** Les lignes renvoyées par la page (après l'aperçu) : reprises champ par champ, contrôlées de nouveau à l'import. */
function lignesRecues(brut: unknown, colonnes: Colonne[]): LigneBrute[] | null {
  let v: unknown;
  try {
    v = JSON.parse(String(brut ?? ""));
  } catch {
    return null;
  }
  if (!Array.isArray(v) || !v.length || v.length > 2000) return null;
  return v.map((l: { ligne?: unknown; valeurs?: Record<string, unknown> }, i) => ({
    ligne: Number.isInteger(l?.ligne) && Number(l.ligne) > 0 ? Number(l.ligne) : i + 2,
    valeurs: Object.fromEntries(colonnes.map((c) => [c.cle, String(l?.valeurs?.[c.cle] ?? "").slice(0, 4000)])),
  }));
}

export async function previsualiserProjets(_: EtatImportProjets, form: FormData): Promise<EtatImportProjets> {
  await exigerImport();
  const r = await lireFichier(form, COLONNES_PROJETS, "titre");
  if ("message" in r) return { message: r.message };
  return { message: null, nomFichier: r.nom, lignes: r.lignes, projets: await planImportProjets(r.lignes) };
}

export async function importerProjets(_: EtatImportProjets, form: FormData): Promise<EtatImportProjets> {
  const a = await exigerImport();
  const lignes = lignesRecues(form.get("lignes"), COLONNES_PROJETS);
  if (!lignes) return { message: "Lignes illisibles : déposez de nouveau le fichier." };
  const r = await appliquerImportProjets(a, lignes);
  if ("erreur" in r) return { message: r.erreur, lignes, projets: r.plan };
  revalidatePath("/projets", "layout");
  return { message: `${r.n} projet${r.n > 1 ? "s" : ""} importé${r.n > 1 ? "s" : ""}.`, ok: true };
}

export async function previsualiserTaches(_: EtatImportProjets, form: FormData): Promise<EtatImportProjets> {
  const a = await exigerImport();
  const r = await lireFichier(form, COLONNES_TACHES, "titre");
  if ("message" in r) return { message: r.message };
  return { message: null, nomFichier: r.nom, lignes: r.lignes, taches: await planImportTaches(a, r.lignes) };
}

export async function importerTaches(_: EtatImportProjets, form: FormData): Promise<EtatImportProjets> {
  const a = await exigerImport();
  const lignes = lignesRecues(form.get("lignes"), COLONNES_TACHES);
  if (!lignes) return { message: "Lignes illisibles : déposez de nouveau le fichier." };
  const r = await appliquerImportTaches(a, lignes);
  if ("erreur" in r) return { message: r.erreur, lignes, taches: r.plan };
  revalidatePath("/projets", "layout");
  revalidatePath("/semaine");
  return { message: `${r.n} tâche${r.n > 1 ? "s" : ""} importée${r.n > 1 ? "s" : ""}${r.livrables ? `, ${r.livrables} livrable${r.livrables > 1 ? "s" : ""} créé${r.livrables > 1 ? "s" : ""}` : ""}.`, ok: true };
}
