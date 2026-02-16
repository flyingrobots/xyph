FROM node:22-slim

# Install build tools, python, and git
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Ensure patch is applied
RUN npx patch-package

# Run lint and tests
CMD ["npm", "run", "lint"]
