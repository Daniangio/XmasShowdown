#
# Dockerfile for the Xmas Showdown Lobby (React)
# This is for PRODUCTION builds.
#

# --- Stage 1: The "Builder" ---
FROM node:18-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

# Copy all source and config files
COPY . .
RUN npm run build

# --- Stage 2: The "Final Server" ---
FROM nginx:1.25-alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
