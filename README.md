## Instalación

## Requisitos
- Docker Desktop (Windows/Mac) o Docker Engine (Linux)
- Node 18+ (solo si vas a desarrollar fuera de Docker)

# Archivos importantes
- `Dockerfile`: cómo construir la imagen
- `docker-compose.yml`: orquesta app + Mongo

1. **Clonar el repositorio**
   ```
   git clone https://github.com/MichelArenas/User-management-and-authentication.git
   cd User-management-and-authentication/back-project
   ```

2. **Instalar dependencias**
   ```
   npm install
   ```

3. **Configurar variables de entorno**
   ```
   cp .env.example .env
   ```
   Editar el archivo `.env` con tus credenciales.

4. **Generar cliente Prisma**
   ```
   npx prisma generate
   ```

5. **Iniciar servidor**
   ```
   cd back-project
   npm run dev
   ```

El servidor estará disponible en `http://localhost:3002`
