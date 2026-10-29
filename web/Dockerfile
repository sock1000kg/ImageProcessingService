FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/frontend/dist ./frontend/dist
RUN addgroup -S app && adduser -S -G app -u 10001 app \
  && chown -R app:app /app
USER 10001
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node backend/dist/server.js"]
