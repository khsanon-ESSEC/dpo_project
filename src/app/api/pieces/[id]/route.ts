import { NextResponse } from "next/server";
import { acces } from "@/lib/acces";
import { utilisateurCourant } from "@/lib/auth/session";
import { lirePiece } from "@/lib/donnees/pieces";
import { noter } from "@/lib/journal";
import { dispositionTelechargement } from "@/lib/pieces";

/**
 * Télécharger une pièce jointe : seulement pour qui peut lire son champ (l'auteur, son supérieur,
 * la direction si le champ ne lui est pas réservé). Toujours en téléchargement, jamais affichée.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.redirect(new URL("/connexion", process.env.APP_URL || "http://localhost:3000"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const p = await lirePiece(await acces(u), id);
  if (!p) return new NextResponse("Introuvable", { status: 404 });
  await noter(u.id, "piece_telechargee", p.id, { rapport: p.rapportId });
  return new NextResponse(new Uint8Array(p.contenu), {
    headers: {
      "content-type": p.type,
      "content-length": String(p.contenu.length),
      "content-disposition": dispositionTelechargement(p.nom),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
}
