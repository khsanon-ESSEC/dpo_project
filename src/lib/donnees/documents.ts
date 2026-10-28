/**
 * Documents d'un projet (cahier des charges, spécification, compte rendu…).
 * - les lire : qui voit le projet ;
 * - en déposer : l'équipe du projet (chef, référent DPO, membres), la personne qui l'a demandé, et ceux qui le
 *   gèrent (sa direction, les exécutifs) ; pas sur un projet archivé ou refusé ;
 * - en retirer : qui l'a déposé, ou qui gère le projet.
 * Les fichiers sont vérifiés comme les pièces jointes du rapport (format reconnu au contenu, 10 Mo au plus) et
 * toujours servis en téléchargement.
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { idsProjetsVisibles, type Acces } from "@/lib/acces";
import { DOCUMENTS_MAX_PAR_PROJET, type CategorieDocument } from "@/lib/documents";
import { noter } from "@/lib/journal";
import { verifierFichier } from "@/lib/pieces";
import { peutGererProjet } from "@/lib/projets";

type Projet = typeof schema.projets.$inferSelect;

const gere = (a: Acces, p: Projet) => peutGererProjet({ moiId: a.moi.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p);

/** Peut-on déposer un document sur ce projet ? */
export async function peutDeposerDocument(a: Acces, p: Projet): Promise<boolean> {
  if (p.archiveLe || p.statut === "refuse") return false;
  if (gere(a, p) || p.chefProjetId === a.moi.id || p.referentId === a.moi.id || p.demandeParId === a.moi.id) return true;
  const [m] = await db
    .select({ id: schema.membresProjet.personneId })
    .from(schema.membresProjet)
    .where(and(eq(schema.membresProjet.projetId, p.id), eq(schema.membresProjet.personneId, a.moi.id)))
    .limit(1);
  return !!m;
}

/** Les documents d'un projet, sans leur contenu, du plus ancien au plus récent. */
export async function documentsDuProjet(projetId: string) {
  return db
    .select({
      id: schema.documentsProjet.id,
      categorie: schema.documentsProjet.categorie,
      nom: schema.documentsProjet.nom,
      type: schema.documentsProjet.type,
      taille: schema.documentsProjet.taille,
      deposeParId: schema.documentsProjet.deposeParId,
      creeLe: schema.documentsProjet.creeLe,
    })
    .from(schema.documentsProjet)
    .where(eq(schema.documentsProjet.projetId, projetId))
    .orderBy(asc(schema.documentsProjet.creeLe));
}
export type DocumentLu = Awaited<ReturnType<typeof documentsDuProjet>>[number];

/** Dépose des fichiers (l'appelant a vérifié le droit de déposer). */
export async function deposerDocuments(a: Acces, projetId: string, categorie: CategorieDocument, fichiers: File[]): Promise<{ deposes: number; erreurs: string[] }> {
  const [{ n }] = await db.select({ n: count() }).from(schema.documentsProjet).where(eq(schema.documentsProjet.projetId, projetId));
  let place = DOCUMENTS_MAX_PAR_PROJET - Number(n);
  const erreurs: string[] = [];
  let deposes = 0;
  for (const f of fichiers) {
    if (!f || typeof f.arrayBuffer !== "function" || !f.name) continue;
    if (place <= 0) {
      erreurs.push(`Cent documents au plus par projet : « ${f.name} » n'a pas été ajouté.`);
      continue;
    }
    const contenu = new Uint8Array(await f.arrayBuffer());
    const v = verifierFichier(f.name, contenu);
    if (!v.ok) {
      erreurs.push(v.erreur);
      continue;
    }
    const empreinte = createHash("sha256").update(contenu).digest("hex");
    const [d] = await db
      .insert(schema.documentsProjet)
      .values({ projetId, categorie, nom: v.nom, type: v.type, taille: contenu.length, empreinte, contenu: Buffer.from(contenu), deposeParId: a.moi.id })
      .returning({ id: schema.documentsProjet.id });
    await noter(a.moi.id, "document_depose", d.id, { projet: projetId, categorie, nom: v.nom, taille: contenu.length, empreinte });
    deposes += 1;
    place -= 1;
  }
  return { deposes, erreurs };
}

/** Un document avec son contenu, pour qui voit son projet ; null sinon. */
export async function lireDocument(a: Acces, documentId: string) {
  // D'abord le projet du document (sans le fichier) : on ne charge le contenu que pour qui peut le lire.
  const [m] = await db.select({ projetId: schema.documentsProjet.projetId }).from(schema.documentsProjet).where(eq(schema.documentsProjet.id, documentId)).limit(1);
  if (!m) return null;
  const visibles = await idsProjetsVisibles(a);
  if (visibles !== "tous" && !visibles.has(m.projetId)) return null;
  const [d] = await db.select().from(schema.documentsProjet).where(eq(schema.documentsProjet.id, documentId)).limit(1);
  return d ?? null;
}

/** Retire un document : qui l'a déposé, ou qui gère le projet. Renvoie un message d'erreur, ou null. */
export async function retirerDocument(a: Acces, p: Projet, documentId: string): Promise<string | null> {
  const [d] = await db
    .select({ id: schema.documentsProjet.id, nom: schema.documentsProjet.nom, deposeParId: schema.documentsProjet.deposeParId, taille: schema.documentsProjet.taille, empreinte: schema.documentsProjet.empreinte, categorie: schema.documentsProjet.categorie })
    .from(schema.documentsProjet)
    .where(and(eq(schema.documentsProjet.id, documentId), eq(schema.documentsProjet.projetId, p.id)))
    .limit(1);
  if (!d) return "Document introuvable.";
  if (p.archiveLe || p.statut === "refuse") return "Ce projet est archivé ou refusé : ses documents restent tels quels.";
  if (d.deposeParId !== a.moi.id && !gere(a, p)) return "Seuls la personne qui l'a déposé et ceux qui gèrent le projet retirent un document.";
  await db.delete(schema.documentsProjet).where(eq(schema.documentsProjet.id, d.id));
  // Le retrait est définitif : le journal garde de quoi le reconnaître (nom, taille, empreinte, qui l'avait déposé).
  await noter(a.moi.id, "document_retire", d.id, { projet: p.id, nom: d.nom, taille: d.taille, empreinte: d.empreinte, categorie: d.categorie, deposePar: d.deposeParId });
  return null;
}
