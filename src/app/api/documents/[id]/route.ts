import { NextResponse } from "next/server";
import { acces } from "@/lib/acces";
import { utilisateurActif } from "@/lib/auth/session";
import { lireDocument } from "@/lib/donnees/documents";
import { noter } from "@/lib/journal";
import { dispositionTelechargement } from "@/lib/pieces";

/** Télécharger un document de projet : pour qui voit le projet. Toujours en téléchargement, jamais affiché. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurActif();
  if (!u) return NextResponse.redirect(new URL("/connexion", process.env.APP_URL || "http://localhost:3000"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const d = await lireDocument(await acces(u), id);
  if (!d) {
    // Refus gardé au journal (même réponse « Introuvable » qu'un fichier qui n'existe pas).
    await noter(u.id, "document_refuse", id);
    return new NextResponse("Introuvable", { status: 404 });
  }
  await noter(u.id, "document_telecharge", d.id, { projet: d.projetId });
  return new NextResponse(new Uint8Array(d.contenu), {
    headers: {
      "content-type": d.type,
      "content-length": String(d.contenu.length),
      "content-disposition": dispositionTelechargement(d.nom),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
}
