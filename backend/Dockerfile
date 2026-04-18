FROM node:24-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build
RUN chmod +x docker-entrypoint.sh

# Drop privileges: the official node image ships a non-root `node` user. Run
# the server as that user so a container compromise cannot trivially modify
# the image filesystem or escalate via root-owned processes.
RUN chown -R node:node /app
USER node

EXPOSE 4000

CMD ["./docker-entrypoint.sh"]
