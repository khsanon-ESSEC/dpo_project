import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Contrôle de santé pour la supervision : l'application répond et la base aussi. Ne révèle rien d'autre. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ etat: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ etat: "base injoignable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
