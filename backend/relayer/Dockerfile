FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# No HTTP server — this is a background poller. Fly keeps the machine
# running as long as the process is alive; no health check endpoint needed.
CMD ["node", "index.js"]
