FROM node:22-slim

# Install build tools, python, and git (minimal, no recommends)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root user
RUN groupadd --system xyph && useradd --system --gid xyph xyph

# Configure git for integration tests
RUN git config --global user.email "ci@xyph.dev" && \
    git config --global user.name "XYPH CI" && \
    git config --global init.defaultBranch main

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN chown -R xyph:xyph /app

# Ensure patch is applied
RUN npx patch-package

USER xyph

# Run lint (tests are run by overriding CMD with `npm run test:local`)
CMD ["npm", "run", "lint"]
