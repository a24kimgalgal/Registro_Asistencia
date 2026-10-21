# Registro de Asistencia

## Backend inicial

El backend usa Node.js, Express y PostgreSQL. Fuera de Docker, la conexión se configura con `DATABASE_URL`; Compose usa las variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. Consulta [.env.example](./.env.example) para la configuración local de Compose.

Requisitos para ejecutarlo fuera de Docker: Node.js 24 o posterior y PostgreSQL con el esquema inicial aplicado desde [`backend/database/migrations/001_initial_schema.sql`](./backend/database/migrations/001_initial_schema.sql).

Instala las dependencias y ejecuta las pruebas desde `backend/`:

```sh
npm install
npm test
```

Desde la raíz del proyecto, copia `.env.example` a `.env` y ajusta `DATABASE_URL`. Arranca el backend con `npm --prefix backend start`, o utiliza `npm --prefix backend run dev` para el modo de desarrollo con reinicio al cambiar archivos. El servidor comprueba la conexión durante el arranque y no inicia si la base de datos no está disponible.

La primera ruta implementada es `GET /api/v1/health`, que consulta PostgreSQL y devuelve `503` si la conexión falla. El resto de las rutas definidas en `PROJECT_STATE.md` se incorporarán gradualmente.

## Frontend inicial

El frontend usa Vue 3, Vuetify y Pinia. Desde `frontend/`:

```sh
npm install
npm test
npm run build
npm run dev
```

La pantalla inicial incluye navegación mensual de lunes a viernes, una ventana visual de 12 meses, resumen y leyenda de asistencia, y estados vacíos para cursos todavía no configurados. No inventa cursos, materias, clases ni asistencias. Las secciones de materias y horario son placeholders; la API todavía solo ofrece `GET /api/v1/health`, por lo que la selección del curso y la edición de asistencias no están habilitadas. Los límites de navegación actuales son solo visuales y se deberán sustituir por las fechas del curso cuando exista el endpoint correspondiente.

En desarrollo, Vite reenvía las rutas `/api` a `http://localhost:3000`. Inicia primero el backend para que se muestre el estado de la conexión. Si la API está en otra dirección, configura `BACKEND_URL` antes de iniciar Vite. `VITE_API_URL` cambia la ruta base que utiliza el frontend; si apuntas a otro origen, ese servidor debe permitir solicitudes desde el navegador.

## Entorno completo con Docker Compose

Compose usa tres contenedores sencillos: PostgreSQL, la API Node y el servidor de desarrollo de Vite. No usa Nginx. Desde la raíz, crea la configuración local:

```sh
Copy-Item .env.example .env
```

En `.env`, cambia `POSTGRES_PASSWORD`. Levanta los tres contenedores:

```sh
docker compose up --build -d
docker compose ps
```

Abre `http://localhost:5173`. La API está disponible en `http://localhost:3000` y el frontend reenvía las llamadas `/api` al backend dentro de la red de Compose. PostgreSQL no publica un puerto al equipo anfitrión. Compose espera a que la base de datos esté lista antes de iniciar la API. La migración se ejecuta al inicializar por primera vez el volumen `postgres_data`; reiniciar Compose conserva los datos.

Para parar los contenedores sin borrar la base de datos, ejecuta `docker compose down`. Si eliminas el volumen `postgres_data`, también borrarás los datos locales.
