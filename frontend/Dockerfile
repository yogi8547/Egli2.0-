# ── Egli2.0 — Frontend Build ──────────────────────────────────
# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

LABEL org.opencontainers.image.title="Egli2.0 Frontend"
LABEL org.opencontainers.image.description="React dashboard for AI-powered infrastructure monitoring"
LABEL org.opencontainers.image.version="1.0.0"

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/

# Copy built frontend from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:80/api/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
