# Multi-stage Dockerfile for Nuxt 3 application

# Stage 1: Dependencies
FROM node:24.22-alpine3.24 AS dependencies
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production=false

# Stage 2: Build
FROM node:24.22-alpine3.24 AS builder
WORKDIR /app

# Accept build arguments for OSM configuration (public values only, no secrets)
ARG OSM_CLIENT_ID
ARG OSM_REDIRECT_URI

# Set as environment variables for the build
ENV OSM_CLIENT_ID=$OSM_CLIENT_ID \
    OSM_REDIRECT_URI=$OSM_REDIRECT_URI

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Stage 3: Production
FROM node:24.22-alpine3.24 AS production
WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy built application
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nuxt -u 1001 && \
    chown -R nuxt:nodejs /app

USER nuxt

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Start the application
CMD ["node", ".output/server/index.mjs"]
