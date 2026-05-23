# Stage 1: Build static assets
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies and cache packages
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Serve compiled assets using high-performance Nginx
FROM nginx:alpine

# Copy built bundle from Stage 1
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
