# 1. Base Image
FROM node:20-alpine

# 2. Environment Setup
WORKDIR /usr/src/app

# 3. Dependency Installation (Caching Layer)
COPY package*.json ./
RUN npm ci --only=production

# 4. Source Code Copy
COPY . .

# 5. Security & Permissions
USER node

# 6. Runtime Command
EXPOSE 4000
CMD ["node", "dist/index.js"]