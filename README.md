# Registro de Asistencia

## Backend inicial

El backend usa Node.js, Express y PostgreSQL. Fuera de Docker, la conexión se configura con `DATABASE_URL`; Compose usa las variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. Consulta [.env.example](./.env.example) para la configuración local de Compose.

Requisitos para ejecutarlo fuera de Docker: Node.js 24 o posterior y PostgreSQL con las migraciones [`001_initial_schema.sql`](./backend/database/migrations/001_initial_schema.sql), [`002_teachers_and_schedule.sql`](./backend/database/migrations/002_teachers_and_schedule.sql), [`003_backdate_initial_schedule_entries.sql`](./backend/database/migrations/003_backdate_initial_schedule_entries.sql), [`004_backdate_added_schedule_entries.sql`](./backend/database/migrations/004_backdate_added_schedule_entries.sql) y [`005_non_teaching_days.sql`](./backend/database/migrations/005_non_teaching_days.sql) aplicadas. Las migraciones 003 y 004 ajustan vigencias de asignaciones del curso local `1` solo cuando los datos coinciden con las precondiciones; en bases que no contengan esas asignaciones no realizan cambios. La migración 005 crea el calendario de días no lectivos, elimina únicamente seis asistencias coincidentes con las fechas festivas que el usuario autorizó expresamente (si coinciden exactamente con los IDs y datos verificados) y falla ante cualquier otra asistencia en esas fechas.

En un volumen Docker existente, una vez actualizado el checkout y recreado el servicio de base de datos para montar las migraciones, aplica explícitamente las que aún estén pendientes (Compose no vuelve a ejecutar automáticamente los scripts init en volúmenes ya creados):

```sh
docker compose up -d database
docker compose exec -T database psql -v ON_ERROR_STOP=1 -U postgres -d registro_asistencia -f /docker-entrypoint-initdb.d/004_backdate_added_schedule_entries.sql
docker compose exec -T database psql -v ON_ERROR_STOP=1 -U postgres -d registro_asistencia -f /docker-entrypoint-initdb.d/005_non_teaching_days.sql
```

Instala las dependencias y ejecuta las pruebas desde `backend/`:

```sh
npm install
npm test
```

Desde la raíz del proyecto, copia `.env.example` a `.env` y ajusta `DATABASE_URL`. Arranca el backend con `npm --prefix backend start`, o utiliza `npm --prefix backend run dev` para el modo de desarrollo con reinicio al cambiar archivos. El servidor comprueba la conexión durante el arranque y no inicia si la base de datos no está disponible.

La API incluye comprobación de salud, cursos, materias, profesores, horario semanal y asistencias. Los horarios se repiten de lunes a viernes; cada tramo guarda el curso, la materia, el profesor (opcional), el día y las horas. Al cambiar o retirar una asignación se cierra su vigencia para conservar los registros históricos. El calendario mensual deriva las clases de esas asignaciones; las clases todavía no registradas se devuelven como `pending`, no como faltas.

Rutas principales:

| Método | Ruta | Uso |
|---|---|---|
| `GET`, `POST` | `/api/v1/courses` | Listar y crear cursos |
| `PATCH`, `DELETE` | `/api/v1/courses/:courseId` | Editar o borrar cursos sin datos relacionados |
| `GET`, `POST` | `/api/v1/courses/:courseId/subjects` | Listar y crear materias |
| `PATCH`, `DELETE` | `/api/v1/subjects/:subjectId` | Editar; eliminar si no se ha usado o desactivar para conservar historial |
| `GET`, `POST` | `/api/v1/teachers` | Listar y crear profesores |
| `PATCH`, `DELETE` | `/api/v1/teachers/:teacherId` | Editar o retirar profesores |
| `GET`, `POST` | `/api/v1/courses/:courseId/schedule` | Consultar y asignar tramos del horario semanal |
| `PATCH` | `/api/v1/schedule/:entryId` | Revisar un tramo creando una nueva versión y conservando el historial |
| `DELETE` | `/api/v1/schedule/:entryId` | Cerrar un tramo en `validUntil`, conservando el historial |
| `DELETE` | `/api/v1/schedule/:entryId/permanent` | Borrar definitivamente un tramo solo si no tiene asistencias |
| `GET` | `/api/v1/courses/:courseId/month?year=YYYY&month=MM` | Consultar clases del mes derivadas del horario, incluidas las pendientes |
| `PUT`, `DELETE` | `/api/v1/schedule/:entryId/attendance/:date` | Crear/actualizar asistencia o quitar el registro |

Para crear un tramo, envía JSON como `{"subjectId": 3, "teacherId": 8, "weekday": 1, "startTime": "08:00", "endTime": "09:00"}` a `/api/v1/courses/2/schedule`. Los días usan ISO: lunes `1` y viernes `5`. El profesor es opcional. El backend toma el inicio del curso como `validFrom`, para que las clases de un horario añadido tarde se puedan completar retrospectivamente. Al revisar un tramo con `PATCH`, la versión nueva empieza en la fecha del cambio y la anterior conserva su vigencia histórica. El endpoint de consulta admite `?date=YYYY-MM-DD` y devuelve tramos dentro del período del curso y vigentes en esa fecha.

Para borrar definitivamente un tramo creado por error, usa `DELETE /api/v1/schedule/:entryId/permanent`. Solo se borra si no tiene registros de asistencia; si los tiene, la API responde `409 SCHEDULE_ENTRY_HAS_ATTENDANCE` sin eliminar datos. Para terminar un tramo y conservar su historial, usa `DELETE /api/v1/schedule/:entryId` con `{"validUntil":"YYYY-MM-DD"}`. Son operaciones distintas.

El calendario mensual devuelve cada clase con la fecha, materia, profesor, horas, estado y campos de asistencia, e incluye `nonTeachingDays` con las fechas festivas del mes para el año académico del curso, incluso cuando una fecha festiva cae fuera de sus fechas lectivas. Las asignaciones semanales no generan clases en esos días. Los estados posibles son `present`, `absent` y `late`; sin registro, el estado devuelto es `pending`. Para guardar o corregir un registro, envía por ejemplo `{"status":"late","arrivedAt":"09:12","notes":"Llegada tarde"}` con `PUT` a `/api/v1/schedule/12/attendance/2026-09-07`. `arrivedAt` y `notes` son opcionales; la hora de llegada solo se admite para `late`. `DELETE` sobre esa misma ruta elimina el registro y deja la clase pendiente. La API valida que la fecha sea un día de clase dentro del curso y de la vigencia del tramo; permite fechas pasadas hasta hoy, rechaza fechas futuras y responde `409 ATTENDANCE_ON_NON_TEACHING_DAY` si se intenta crear, modificar o quitar asistencia en un día no lectivo.

Las fechas confirmadas del curso `2026-2027` se almacenan en `non_teaching_days`, agrupadas por año académico. La migración impide fechas de fin de semana y valida que las seis asistencias expresamente autorizadas coincidan con los registros verificados antes de eliminarlas; falla si encuentra cualquier otro registro de asistencia en festivos. El repositorio consulta PostgreSQL; el calendario mensual expone `nonTeachingDays` y excluye esos días de las clases, y la validación de asistencia también está protegida por un trigger de base de datos.

## Administración desde el frontend

Abre la sección **Administración** desde la navegación principal o pulsa **Administrar curso**. Allí puedes crear, editar o borrar cursos (el borrado falla si tienen datos relacionados), crear y editar materias/profesores y retirar los que ya no uses. Una materia que nunca se asignó a un horario se elimina; si ya se usó, se desactiva para preservar el historial y puede reactivarse. En **Horario semanal**, selecciona un curso y configura materia, profesor opcional, día y hora; las nuevas asignaciones toman la fecha de inicio del curso. Al cambiar o cerrar una asignación, el sistema conserva la vigencia anterior para no alterar las clases ya registradas.

## Frontend inicial

El frontend usa Vue 3, Vuetify y Pinia. Desde `frontend/`:

```sh
npm install
npm test
npm run build
npm run dev
```

La pantalla permite seleccionar un curso y consultar sus clases mensuales. En **Horario**, elige la fecha y marca cada clase (cada hora) por separado como presente, falta o retardo; puedes cambiar el estado o dejarla pendiente. Así, en un mismo día cada hora puede tener un estado distinto. **Calendario** muestra los estados de todas las clases por fecha y permite añadir la hora de llegada o notas a un retardo. Las clases sin registro aparecen como pendientes. **Materias** muestra el catálogo del curso. Los horarios solo muestran tramos creados desde Administración; la aplicación no inventa materias ni horas.

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

Abre `http://localhost:5173`. La API está disponible en `http://localhost:3000` y el frontend reenvía las llamadas `/api` al backend dentro de la red de Compose. PostgreSQL no publica un puerto al equipo anfitrión. Compose espera a que la base de datos esté lista antes de iniciar la API. Las migraciones se ejecutan al inicializar por primera vez el volumen `postgres_data`; la 003 comprueba sus precondiciones y no cambia nada si el curso local `1` no existe. En un volumen existente, PostgreSQL no vuelve a ejecutar los scripts de inicialización: aplica manualmente las migraciones pendientes, incluida la 003 cuando los datos correspondan a sus condiciones. Reiniciar Compose conserva los datos.

Para parar los contenedores sin borrar la base de datos, ejecuta `docker compose down`. Si eliminas el volumen `postgres_data`, también borrarás los datos locales.
