# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copia solo los manifiestos primero (cache de dependencias)
COPY package*.json ./

# Instala dependencias de producción
RUN npm ci --omit=dev

# Copia el resto del código
COPY . .

# Genera el cliente de Prisma (usa tu schema.prisma y env)
# Para Mongo no hay migraciones, solo generate
RUN npx prisma generate

# Expón el puerto de tu API (ajústalo a tu app)
EXPOSE 3002

# Arranque (ajusta si tu entrypoint es otro)
CMD ["npm", "start"]
