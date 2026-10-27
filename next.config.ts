import type { NextConfig } from "next";

/**
 * En-têtes de sécurité appliqués à toutes les pages.
 * La politique de contenu n'autorise aucune ressource externe : polices, logos et scripts
 * sont servis par l'application elle-même.
 */
const enTetesSecurite = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  // Pièces jointes du rapport : 10 Mo par fichier (src/lib/pieces.ts), avec un peu de marge pour le formulaire.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [{ source: "/:path*", headers: enTetesSecurite }];
  },
};

export default config;
