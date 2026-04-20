FROM node:18

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  libglib2.0-0 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libpango-1.0-0 \
  libcairo2 \
  fonts-liberation \
  libappindicator3-1 \
  xdg-utils \
  wget

# Set environment to skip Puppeteer Chromium download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package*.json ./
RUN npm install

# Verify Chromium path during build so Railway logs show the installed binary location
RUN command -v chromium || command -v chromium-browser || true
RUN ls -l /usr/bin/chromium /usr/bin/chromium-browser || true

COPY . .

CMD ["node", "index.js"]