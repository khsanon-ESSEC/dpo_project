# Pilotage des projets DPO : image de production.
# Construction : docker build -t pilotage-dpo:0.1.0 .
# Voir README.md (« Installation ») pour le lancement avec docker compose.

# ---- 1. Dépendances (toutes, pour compiler) ----
FROM node:22-bookworm-slim AS dependances
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2. Compilation ----
FROM node:22-bookworm-slim AS compilation
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependances /app/node_modules ./node_modules
COPY . .
# La compilation ne se connecte pas à la base.
RUN npm run build

# ---- 3. Dépendances de production seulement (pour les scripts de migration et d'administration) ----
FROM node:22-bookworm-slim AS production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- 4. Image finale ----
FROM node:22-bookworm-slim AS execution
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Utilisateur sans privilèges
RUN groupadd --system --gid 1001 dpo && useradd --system --uid 1001 --gid dpo --no-create-home dpo
COPY --from=production --chown=dpo:dpo /app/node_modules ./node_modules
COPY --from=compilation --chown=dpo:dpo /app/.next/standalone ./
COPY --from=compilation --chown=dpo:dpo /app/.next/static ./.next/static
COPY --from=compilation --chown=dpo:dpo /app/public ./public
COPY --chown=dpo:dpo drizzle ./drizzle
COPY --chown=dpo:dpo scripts ./scripts
COPY --chown=dpo:dpo docker/demarrer.sh ./demarrer.sh
USER dpo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./demarrer.sh"]
