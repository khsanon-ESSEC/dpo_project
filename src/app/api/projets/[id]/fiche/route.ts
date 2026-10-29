import { NextResponse } from "next/server";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { utilisateurActif } from "@/lib/auth/session";
import { ficheAExporter } from "@/lib/donnees/fiche-projet";
import { ficheProjetWord, nomFichierFiche } from "@/lib/fiche-word";
import { noter } from "@/lib/journal";

/** La fiche de projet en Word : à qui voit le projet (le budget, à qui le gère). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.redirect(new URL("/connexion", process.env.APP_URL || "http://localhost:3000"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Projet introuvable", { status: 404 });
  const a = await acces(u);
  const visibles = await idsProjetsVisibles(a);
  if (visibles !== "tous" && !visibles.has(id)) {
    await noter(u.id, "fiche_refusee", id);
    return new NextResponse("Projet introuvable", { status: 404 });
  }
  const f = await ficheAExporter(a, id);
  if (!f) return new NextResponse("Projet introuvable", { status: 404 });
  const fichier = await ficheProjetWord(f);
  await noter(u.id, "fiche_word", id);
  return new NextResponse(new Uint8Array(fichier), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${nomFichierFiche(f)}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
