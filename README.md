# Registro de Asistencia

## Backend inicial

El backend usa Node.js, Express y PostgreSQL. Fuera de Docker, la conexión se configura con `DATABASE_URL`; Compose usa las variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. Consulta [.env.example](./.env.example) para la configuración local de Compose.

Requisitos para ejecutarlo fuera de Docker: Node.js 24 o posterior y PostgreSQL con las migraciones [`001_initial_schema.sql`](./backend/database/migrations/001_initial_schema.sql) y [`002_teachers_and_schedule.sql`](./backend/database/migrations/002_teachers_and_schedule.sql) aplicadas.

Instala las dependencias y ejecuta las pruebas desde `backend/`:

```sh
npm install
npm test
```

Desde la raíz del proyecto, copia `.env.example` a `.env` y ajusta `DATABASE_URL`. Arranca el backend con `npm --prefix backend start`, o utiliza `npm --prefix backend run dev` para el modo de desarrollo con reinicio al cambiar archivos. El servidor comprueba la conexión durante el arranque y no inicia si la base de datos no está disponible.

La API incluye comprobación de salud, cursos, materias, profesores y horario semanal. Los horarios se repiten de lunes a viernes; cada tramo guarda el curso, la materia, el profesor (opcional), el día y las horas. Al cambiar o retirar una asignación se cierra su vigencia para conservar los registros históricos.

Rutas principales:

| Método | Ruta | Uso |
|---|---|---|
| `GET`, `POST` | `/api/v1/courses` | Listar y crear cursos |
| `PATCH`, `DELETE` | `/api/v1/courses/:courseId` | Editar o borrar cursos sin datos relacionados |
| `GET`, `POST` | `/api/v1/courses/:courseId/subjects` | Listar y crear materias |
| `PATCH`, `DELETE` | `/api/v1/subjects/:subjectId` | Editar o retirar materias |
| `GET`, `POST` | `/api/v1/teachers` | Listar y crear profesores |
| `PATCH`, `DELETE` | `/api/v1/teachers/:teacherId` | Editar o retirar profesores |
| `GET`, `POST` | `/api/v1/courses/:courseId/schedule` | Consultar y asignar tramos del horario semanal |
| `PATCH`, `DELETE` | `/api/v1/schedule/:entryId` | Revisar o cerrar un tramo conservando su historial |

Para crear un tramo, envía JSON como `{"subjectId": 3, "teacherId": 8, "weekday": 1, "startTime": "08:00", "endTime": "09:00", "validFrom": "2026-09-01"}` a `/api/v1/courses/2/schedule`. Los días usan ISO: lunes `1` y viernes `5`. El profesor es opcional. El endpoint de consulta admite `?date=YYYY-MM-DD` y solo devuelve tramos vigentes en esa fecha.

El CRUD de asistencias y el calendario mensual derivado todavía están pendientes.

## Administración desde el frontend

Abre la sección **Administración** desde la navegación principal o pulsa **Administrar curso**. Allí puedes crear, editar o borrar cursos (el borrado falla si tienen datos relacionados), crear y editar materias/profesores, y desactivarlos o reactivarlos sin perder su historial. En **Horario semanal**, primero selecciona un curso y configura materia, profesor opcional, día, hora y fecha de inicio. Los cambios y cierres de asignaciones indican una fecha efectiva para conservar las versiones anteriores del horario. La lista muestra las asignaciones vigentes en la fecha seleccionada.

## Frontend inicial

El frontend usa Vue 3, Vuetify y Pinia. Desde `frontend/`:

```sh
npm install
npm test
npm run build
npm run dev
```

La pantalla inicial incluye navegación mensual de lunes a viernes, una ventana visual de 12 meses, resumen y leyenda de asistencia, y estados vacíos para cursos todavía no configurados. No inventa cursos, materias, clases ni asistencias. La interfaz todavía no está conectada a los endpoints de cursos, materias y horario; los límites de navegación son visuales.

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

Abre `http://localhost:5173`. La API está disponible en `http://localhost:3000` y el frontend reenvía las llamadas `/api` al backend dentro de la red de Compose. PostgreSQL no publica un puerto al equipo anfitrión. Compose espera a que la base de datos esté lista antes de iniciar la API. Las migraciones se ejecutan al inicializar por primera vez el volumen `postgres_data`; si ya tienes una base creada con solo la migración 001, aplica manualmente la 002 antes de usar los endpoints nuevos. Reiniciar Compose conserva los datos.

Para parar los contenedores sin borrar la base de datos, ejecuta `docker compose down`. Si eliminas el volumen `postgres_data`, también borrarás los datos locales.
