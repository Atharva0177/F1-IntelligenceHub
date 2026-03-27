FROM node:18-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (skip audit/fund to reduce network stalls in container builds)
RUN npm ci --prefer-offline --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000

# Copy application code
COPY . .

# Make BACKEND_URL available at build time so Next.js bakes the correct
# rewrite destination into the production bundle.
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=${BACKEND_URL}

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
