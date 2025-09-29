FROM node: 18-alpine

WORKDIR /app

COPY package*.json ./

#instalar dependencias
RUN npm install

#Instlar node modules con architectura-s
#RUN npm install --arch=x64

COPY . .

RUN npm prisma generate

CMD ["npm", "start"]