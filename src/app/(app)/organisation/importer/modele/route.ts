import { memeOrigine } from "@/lib/origine";
import { NextResponse, type NextRequest } from "next/server";
import { utilisateurActif } from "@/lib/auth/session";
import { tableauOrganisation } from "@/lib/donnees/import-organisation";
import { ENTETES } from "@/lib/import-organisation";
import { peutAdministrer } from "@/lib/regles";
import { ecrireXlsx } from "@/lib/tableur";

const LARGEURS = [16, 18, 34, 32, 30, 34];

function classeur(lignes: string[][], nom: string) {
  return new NextResponse(Buffer.from(ecrireXlsx([ENTETES, ...lignes], "Organisation", LARGEURS)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nom}"`,
      "cache-control": "no-store",
    },
  });
}

async function administrateur() {
  const u = await utilisateurActif();
  return u && !u.externe && peutAdministrer(u) ? u : null;
}

/** Modèle d'import : l'organisation actuelle (personnes actives de la division), à compléter dans Excel. */
export async function GET() {
  if (!(await administrateur())) return new NextResponse("Introuvable", { status: 404 });
  return classeur(await tableauOrganisation(), "organisation-dpo.xlsx");
}

/** Ce qu'on a lu dans l'annuaire, en Excel, pour le retoucher avant de l'importer. */
export async function POST(req: NextRequest) {
  if (!memeOrigine(req.headers)) return new NextResponse("Requête refusée", { status: 403 });
  if (!(await administrateur())) return new NextResponse("Introuvable", { status: 404 });
  const form = await req.formData();
  let v: unknown;
  try {
    v = JSON.parse(String(form.get("lignes") ?? ""));
  } catch {
    v = null;
  }
  if (!Array.isArray(v) || v.length > 2000) return new NextResponse("Requête illisible", { status: 400 });
  const t = (x: unknown) => String(x ?? "").slice(0, 200);
  const lignes = v.map((l: Record<string, unknown>) => [t(l?.prenom), t(l?.nom), t(l?.courriel), t(l?.poste), t(l?.equipe), t(l?.superieur)]);
  return classeur(lignes, "annuaire-dpo.xlsx");
}
