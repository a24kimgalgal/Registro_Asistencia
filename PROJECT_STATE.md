# PROJECT_STATE

## Estado Actual

Implementación inicial. Existe la migración PostgreSQL y un backend Express mínimo que comprueba la conexión a la base de datos al arrancar y ofrece `GET /api/v1/health`. El backend toma la URL de conexión de `DATABASE_URL`; aún no se ha configurado una instancia real en este entorno. El frontend Vue 3, Vuetify y Pinia ofrece una pantalla inicial de calendario sin datos ficticios, con navegación mensual en una ventana visual de 12 meses, estados vacíos, navegación entre secciones y comprobación de salud. Los endpoints de cursos, materias, horarios y asistencias siguen pendientes; los límites visuales actuales no representan las fechas de un curso real.

## Decisión de Base de Datos

**PostgreSQL (relacional).** Los cursos, materias, horarios semanales y registros de asistencia tienen relaciones claras y requieren integridad (por ejemplo, impedir dos registros para la misma clase y fecha). El modelo relacional también facilita consultar y resumir la asistencia por mes, materia y curso.

## Alcance Inicial

Aplicación web personal para registrar la asistencia a clases de lunes a viernes. La persona usuaria podrá:

- Crear cursos escolares y cambiar cuál es el curso actual; conservar cursos anteriores para consultar su historial.
- Definir un catálogo de materias y asignar materias a las horas/días de la semana del horario del curso.
- Consultar el calendario de los 12 meses del curso y navegar por mes.
- Registrar para cada clase **presente**, **falta** o **retard** (llegada tarde), y corregir o modificar el registro.
- Ver recuentos mensuales por estado y materia.

El horario es una plantilla recurrente de lunes a viernes; no se crean las clases manualmente día por día. Si cambia el horario, los nuevos tramos de vigencia deben conservar las asignaciones que respaldan registros históricos. Los días sin clase o vacaciones no generan clases ni faltas automáticamente. No se incluye inicialmente la gestión multiusuario ni de justificaciones.

## Estructura del Proyecto

Estructura objetivo con backend y frontend separados, y la configuración común en la raíz:

```text
/
├── backend/                 # Node.js, Express, Socket.io y acceso PostgreSQL
│   ├── src/                 # App Express, configuración, pool PostgreSQL y health check
│   ├── tests/               # Jest
│   ├── database/
│   │   ├── migrations/      # Migraciones versionadas
│   │   └── seeds/           # Datos de desarrollo opcionales
│   ├── Dockerfile           # Contenedor Node.js sencillo, sin privilegios
│   └── package.json
├── frontend/                # Vue 3, Vuetify y Pinia
│   ├── src/                 # Aplicación inicial y estado de conexión
│   ├── tests/               # Vitest
│   ├── Dockerfile           # Contenedor Vite de desarrollo, sin privilegios
│   └── package.json
├── docker-compose.yml       # Entorno local: frontend, backend y PostgreSQL
├── .env.example             # Variables del entorno local
├── .github/workflows/       # CI: comprobaciones y pruebas
└── README.md                # Instalación y uso
```

Backend y frontend mantienen sus dependencias y comandos separados. Los workflows de GitHub, Docker Compose, la configuración de entorno y la documentación se gestionan desde la raíz.

## Esquemas de Datos (Modelos)

- La migración inicial está en `backend/database/migrations/001_initial_schema.sql`. El esquema está implementado en PostgreSQL sin acoplarlo todavía a un ORM concreto.
- **Course** (`courses`): `id` (`bigint` identity), `name`, `academic_year`, `start_date`, `end_date`, `is_current` (por defecto `false`) y `created_at` (`timestamptz`). `end_date` no puede preceder a `start_date`; el par (`academic_year`, `name`) es único y un índice único parcial permite un solo curso actual.
- **Subject** (`subjects`): `id`, `course_id`, `name`, `color` opcional, `is_active` (por defecto `true`) y `created_at`. Relación N:1 con Course. El nombre no se repite dentro del mismo curso, sin distinguir mayúsculas/minúsculas. Para retirar materias se cambia `is_active`; las claves foráneas impiden borrar cursos o materias con historial dependiente.
- **ScheduleEntry** (`schedule_entries`): `id`, `course_id`, `subject_id`, `weekday` (ISO: lunes=1 a viernes=5), `start_time`, `end_time`, `valid_from`, `valid_until` opcional. Relación N:1 con Course y Subject; una clave foránea compuesta garantiza que la materia pertenezca al mismo curso. La vigencia se interpreta como intervalo semiabierto `[valid_from, valid_until)`, por lo que `valid_until` no forma parte del período. Los horarios no pueden tener fin anterior o igual al inicio ni solaparse en día, hora y período de vigencia. Una vez creada una asignación, su curso, materia, día, horas y comienzo son inmutables; se cierra asignando `valid_until` y se inserta otra asignación para preservar el historial.
- **Attendance** (`attendance`): `id`, `schedule_entry_id`, `class_date`, `status` (`present`, `absent`, `late`), `arrived_at` opcional, `notes` opcional, `created_at` y `updated_at` (`timestamptz`). Relación N:1 con ScheduleEntry; restricción única sobre (`schedule_entry_id`, `class_date`). Un trigger valida que la fecha corresponda al día y a la vigencia de la asignación. `arrived_at` solo se admite con estado `late`; `updated_at` se refresca al modificar el registro.

Los identificadores y relaciones usan claves foráneas restrictivas para no borrar datos históricos por cascada. Los índices cubren la selección del curso actual, materias y horarios por curso, la búsqueda mensual de asistencias y la exclusión de horarios solapados. Al cargar calendarios mensuales, el backend debe recuperar asistencias por rango de fechas mediante una consulta conjunta con asignaciones y materias (o una consulta por lote); no debe consultar cada clase individualmente para evitar N+1.

Las clases que aparecen en una fecha se derivan del horario vigente de ese curso. Si no existe un registro de asistencia para una clase, se muestra como pendiente/no registrado; no se interpreta automáticamente como falta.

## Rutas API y Eventos WebSocket

API REST versionada bajo `/api/v1`:

| Método y ruta | Uso |
|---|---|
| `GET /api/v1/health` | Comprobar el estado del backend y la conexión PostgreSQL (implementada inicialmente) |
| `GET /courses` | Listar cursos |
| `POST /courses` | Crear curso |
| `PATCH /courses/:courseId` | Editar datos o establecer como curso actual |
| `GET /courses/:courseId/subjects` | Listar materias |
| `POST /courses/:courseId/subjects` | Crear materia |
| `PATCH /subjects/:subjectId` / `DELETE /subjects/:subjectId` | Modificar o retirar una materia sin romper el historial |
| `GET /courses/:courseId/schedule` | Consultar horario vigente |
| `POST /courses/:courseId/schedule` | Crear asignación horaria |
| `PATCH /schedule/:entryId` | Cambiar asignación cerrando su vigencia y creando la revisión correspondiente |
| `GET /courses/:courseId/month?year=YYYY&month=MM` | Devolver clases programadas del mes y su estado, incluyendo pendientes |
| `PUT /schedule/:entryId/attendance/:date` | Crear o actualizar el estado de asistencia de una clase |
| `DELETE /schedule/:entryId/attendance/:date` | Quitar un registro y volverlo a pendiente |

Socket.io emite `attendance:updated` después de una escritura válida, con el curso, la fecha y el identificador de la clase, para refrescar otras pestañas abiertas. La API REST es la fuente de verdad; la aplicación debe seguir funcionando si no hay conexión WebSocket. No hay eventos de escritura vía socket.

## Tareas Pendientes (ToDo)

- **Backend:** Completar endpoints Express para cursos, materias, revisiones de horario, clases mensuales derivadas y CRUD de asistencia. La API Express mínima, pool PostgreSQL, comprobación de conexión y migración inicial ya existen. Añadir las validaciones de entrada, Socket.io para emitir `attendance:updated` tras guardar correctamente y pruebas Jest para las rutas y reglas de fechas.
- **Frontend:** La aplicación inicial usa Vue/Vuetify y Pinia, consulta `GET /api/v1/health`, permite repetir la comprobación y comunica si falla la API o la base de datos. La pantalla incluye el esqueleto del calendario y placeholders para materias y horario, sin datos ficticios ni escritura de asistencias. Pendiente: conectar la selección de cursos, materias, horario recurrente, calendario derivado y edición de estados; mantener el estado de UI con Pinia cuando se integre la API y mostrar errores de datos.
- **DevOps:** Existe un Docker Compose local único para frontend, backend y PostgreSQL, con imágenes multi-stage/ligeras, persistencia, healthchecks y migración inicial automática sobre un volumen nuevo. Pendiente: GitHub Actions para lint, pruebas y build, y documentación de despliegue seguro más allá del entorno local.
- **QA:** Añadir pruebas Jest para reglas de fechas, cambios de horario y endpoints; añadir pruebas Vitest para navegación mensual, estados y formularios.
- **Documentación:** Completar README con instalación, uso, decisiones del modelo y procedimiento para respaldos de la base de datos.

## Criterios de Aceptación Iniciales

1. Crear y seleccionar un curso actual, y cambiarlo sin perder el acceso a cursos previos.
2. Definir materias y un horario recurrente por día y hora sin crear manualmente las clases diarias.
3. Abrir cada uno de los 12 meses del curso y distinguir clases pendientes de presentes, faltas y retardos.
4. Crear, modificar y eliminar registros de asistencia; una clase solo puede tener un registro por fecha.
5. Cambiar el horario sin cambiar inadvertidamente el significado de los registros históricos.
6. Mostrar los totales mensuales por estado y materia, y validar fechas y horas inválidas o solapadas.

## Arranque del Backend

Requiere Node.js 24 o posterior y PostgreSQL con la migración inicial aplicada. Configura `DATABASE_URL` para desarrollo local; Compose configura `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. El servidor no escucha peticiones si no puede conectar con PostgreSQL. En esta fase solo está disponible `GET /api/v1/health`.

## Entorno Local con Docker Compose

El único Compose actual, [`docker-compose.yml`](./docker-compose.yml), levanta tres contenedores sencillos: PostgreSQL (`database`), Express (`backend`) y el servidor de desarrollo Vite (`frontend`); no utiliza Nginx. Copia `.env.example` a `.env`, cambia `POSTGRES_PASSWORD` y ejecuta `docker compose up --build -d`. La interfaz queda disponible en `http://localhost:5173` y la API en `http://localhost:3000`; Vite reenvía las solicitudes `/api` al backend. La base de datos no publica puertos al anfitrión. La migración inicial se ejecuta al crear un volumen PostgreSQL vacío; `postgres_data` conserva los datos entre reinicios. Más adelante se añadirá por separado la configuración de producción.
