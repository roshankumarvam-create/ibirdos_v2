FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev

FROM base AS deps
COPY package.json ./
RUN npm install --production

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

RUN mkdir -p logs

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/server.js"]
