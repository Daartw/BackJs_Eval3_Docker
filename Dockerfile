# Etapa de construcción y ejecución
FROM node:18-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar archivos de dependencias primero (aprovecha la caché de capas)
COPY package*.json ./

# Instalar dependencias de producción
RUN npm install --omit=dev

# Copiar el código fuente
COPY server.js ./

# Exponer el puerto del servicio
EXPOSE 8081

# Comando de inicio
CMD ["node", "server.js"]
