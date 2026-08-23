# socials-assistant — self-contained HTTP MCP + weekly automation
FROM node:25-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm build

FROM node:25-slim
WORKDIR /app
ENV NODE_ENV=production SOCIALS_DATA_DIR=/data SOCIALS_MCP_PORT=3344
COPY --from=build /app /app
VOLUME ["/data"]
EXPOSE 3344
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3344/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/mcp/bin/socials-mcp.js", "--http"]
