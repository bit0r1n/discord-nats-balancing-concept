FROM node:24.12.0-alpine3.23 AS deps

WORKDIR /app
COPY ./package*.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app
COPY . .
RUN npm run build

FROM builder AS gateway
CMD [ "node", "dist/gateway/gateway.service.js" ]

FROM builder AS commands
CMD [ "node", "dist/commands/commands.service.js" ]
