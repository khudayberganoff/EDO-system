FROM node:20-slim

# LibreOffice - to'ldirilgan Word shablonini o'z formatida PDF ga aylantirish uchun.
# Shriftlar ham kerak, aks holda o'zbekcha/kirill harflar noto'g'ri chiqadi.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-core \
      openssl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Avval faqat manifestlarni ko'chiramiz - qatlam keshi yaxshiroq ishlaydi
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "run", "start"]
