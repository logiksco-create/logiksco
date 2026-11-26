# Bot de facturación electrónica de LOGIKS.CO. Construir desde la RAÍZ del repo:
#   docker build -f worker/einvoice-bot/Dockerfile -t logiks-einvoice-bot .
# (usa src/domain/einvoice.ts de la aplicación para no duplicar reglas)
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY worker/einvoice-bot/package.json worker/einvoice-bot/package-lock.json* worker/einvoice-bot/
RUN cd worker/einvoice-bot && npm install --omit=dev --no-audit --no-fund
COPY src/domain/einvoice.ts src/domain/types.ts src/domain/
COPY worker/einvoice-bot/src worker/einvoice-bot/src
WORKDIR /app/worker/einvoice-bot
ENV NODE_ENV=production
USER pwuser
CMD ["npx", "tsx", "src/main.ts"]
