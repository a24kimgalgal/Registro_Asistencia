# PROJECT_STATE

## Estado Actual

**Hallazgo frontend (22/10/2026):** la API puede devolver `classDate` con la hora incluida, por ejemplo `2026-10-22T00:00:00.000Z`. La interfaz comparaba ese valor directamente con la fecha seleccionada (`2026-10-22`), por lo que el horario semanal mostraba clases pero el bloque del día no las encontraba. Frontend normaliza el valor a `YYYY-MM-DD` antes de agrupar y filtrar clases.

Implementación inicial utilizable. El backend Express ofrece cursos, materias, profesores, asignaciones semanales, consulta mensual y registro individual de asistencia. No existe una página separada de “clases del día”: dentro de Horario, el bloque “Clases del [día]” usa la consulta mensual para mostrar las clases de la fecha seleccionada y sus controles de asistencia. La plantilla semanal inferior es una referencia recurrente separada. Frontend selecciona hoy al abrir un curso vigente, permite navegar una ventana de doce meses (seis anteriores y cinco posteriores al mes actual) y descarta respuestas antiguas si cambia rápidamente de curso o fecha. Los meses fuera del período del curso se pueden consultar, pero no contienen clases. **Pendiente de decisión/implementación:** permitir registrar asistencia retrospectiva para las clases entre la fecha de inicio del curso y hoy; las asignaciones actuales comienzan hoy y la consulta mensual respeta `valid_from`, por lo que no genera clases anteriores a esa fecha. Las fechas futuras deben seguir siendo solo de consulta, sin permitir cambios. En la prueba local del backend, ambas consultas devolvieron cuatro clases para el día de la captura; la causa original no se reprodujo.

En Administración, la fecha técnica `validFrom` ya no se pide al crear una asignación: el frontend la calcula como hoy o como el inicio del curso futuro. Los cursos finalizados no admiten nuevas asignaciones. Cambiar una asignación calcula una fecha efectiva automáticamente y conserva la anterior. Cerrar una asignación termina su vigencia conservando el historial; Borrar elimina solo asignaciones que no tienen asistencias. Las materias sin horario se eliminan y las ya usadas en horarios se desactivan para preservar el historial.

Mantener la implementación sencilla: reutilizar las rutas existentes y evitar añadir capas, automatismos o dependencias que no hagan falta para este flujo.

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

- Las migraciones están en `backend/database/migrations/001_initial_schema.sql` y `002_teachers_and_schedule.sql`. El esquema está implementado en PostgreSQL sin acoplarlo todavía a un ORM concreto.
- **Course** (`courses`): `id` (`bigint` identity), `name`, `academic_year`, `start_date`, `end_date`, `is_current` (por defecto `false`) y `created_at` (`timestamptz`). `end_date` no puede preceder a `start_date`; el par (`academic_year`, `name`) es único y un índice único parcial permite un solo curso actual.
- **Subject** (`subjects`): `id`, `course_id`, `name`, `color` opcional, `is_active` (por defecto `true`) y `created_at`. Relación N:1 con Course. El nombre no se repite dentro del mismo curso, sin distinguir mayúsculas/minúsculas. La API elimina materias sin asignaciones y desactiva las que ya aparecen en horarios para preservar el historial.
- **Teacher** (`teachers`): `id`, `name`, `is_active` (por defecto `true`) y `created_at`. Es un catálogo común de profesores. Los nombres de profesores activos no se repiten sin distinguir mayúsculas/minúsculas; retirar un profesor lo desactiva y conserva el historial.
- **ScheduleEntry** (`schedule_entries`): `id`, `course_id`, `subject_id`, `teacher_id` opcional, `weekday` (ISO: lunes=1 a viernes=5), `start_time`, `end_time`, `valid_from`, `valid_until` opcional. Relación N:1 con Course, Subject y Teacher; una clave foránea compuesta garantiza que la materia pertenezca al mismo curso. La vigencia se interpreta como intervalo semiabierto `[valid_from, valid_until)`, por lo que `valid_until` no forma parte del período. Los horarios no pueden tener fin anterior o igual al inicio ni solaparse en día, hora y período de vigencia. Una vez creada una asignación, su curso, materia, profesor, día, horas y comienzo son inmutables; se cierra asignando `valid_until` y se inserta otra asignación para preservar el historial.
- **Attendance** (`attendance`): `id`, `schedule_entry_id`, `class_date`, `status` (`present`, `absent`, `late`), `arrived_at` opcional, `notes` opcional, `created_at` y `updated_at` (`timestamptz`). Relación N:1 con ScheduleEntry; restricción única sobre (`schedule_entry_id`, `class_date`). Un trigger valida que la fecha corresponda al día y a la vigencia de la asignación. `arrived_at` solo se admite con estado `late`; `updated_at` se refresca al modificar el registro.

Los identificadores y relaciones usan claves foráneas restrictivas para no borrar datos históricos por cascada. Los índices cubren la selección del curso actual, materias y horarios por curso, la búsqueda mensual de asistencias y la exclusión de horarios solapados. Al cargar calendarios mensuales, el backend debe recuperar asistencias por rango de fechas mediante una consulta conjunta con asignaciones y materias (o una consulta por lote); no debe consultar cada clase individualmente para evitar N+1.

Las clases que aparecen en una fecha se derivan del horario vigente de ese curso. Si no existe un registro de asistencia para una clase, se muestra como pendiente/no registrado; no se interpreta automáticamente como falta.

## Rutas API y Eventos WebSocket

API REST versionada bajo `/api/v1`:

| Método y ruta | Uso |
|---|---|
| `GET /api/v1/health` | Comprobar el estado del backend y la conexión PostgreSQL (implementada inicialmente) |
| `GET /api/v1/courses` / `POST /api/v1/courses` | Listar y crear cursos |
| `PATCH /api/v1/courses/:courseId` / `DELETE /api/v1/courses/:courseId` | Editar, marcar como actual o borrar un curso sin datos relacionados |
| `GET /api/v1/courses/:courseId/subjects` / `POST /api/v1/courses/:courseId/subjects` | Listar y crear materias de un curso |
| `PATCH /api/v1/subjects/:subjectId` / `DELETE /api/v1/subjects/:subjectId` | Modificar o retirar una materia sin romper el historial |
| `GET /api/v1/teachers` / `POST /api/v1/teachers` | Listar y crear profesores |
| `PATCH /api/v1/teachers/:teacherId` / `DELETE /api/v1/teachers/:teacherId` | Modificar o retirar un profesor sin romper el historial |
| `GET /api/v1/courses/:courseId/schedule?date=YYYY-MM-DD` | Consultar asignaciones vigentes dentro del período del curso |
| `POST /api/v1/courses/:courseId/schedule` | Asignar materia, profesor, día, horas recurrentes y `validFrom` requerido a un curso |
| `PATCH /api/v1/schedule/:entryId` | Cerrar la asignación en `validUntil` y crear su nueva versión, preservando el historial |
| `DELETE /api/v1/schedule/:entryId` | Cerrar (no borrar definitivamente) una asignación en la fecha `validUntil` indicada, preservando el historial |
| `DELETE /api/v1/schedule/:entryId/permanent` | Borrar definitivamente una asignación solo si no tiene asistencias; si tiene, responder 409 sin borrar datos |
| `GET /api/v1/courses/:courseId/month?year=YYYY&month=MM` | Devolver clases programadas en el mes y su estado, incluyendo pendientes |
| `PUT /api/v1/schedule/:entryId/attendance/:date` | Crear o actualizar la asistencia (`present`, `absent` o `late`) |
| `DELETE /api/v1/schedule/:entryId/attendance/:date` | Quitar un registro y volverlo a pendiente |

Socket.io no está implementado ni es necesario para el uso individual básico; no es una prioridad hasta que exista una necesidad real de sincronización entre varias sesiones.

## Tareas Pendientes (ToDo)

El flujo deseado es sencillo: crear curso y materias, asignar profesor/día/hora sin introducir fechas técnicas, elegir la fecha en Horario y marcar cada clase de ese día como presente, falta o retardo. Calendario debe reflejar el estado individual de cada clase. Crear un curso o materia no debe generar clases automáticamente, y una clase sin registro sigue pendiente, no es una falta. Una asignación creada por error debe poder borrarse sin eliminar historial silenciosamente.

### Requisito pendiente — asistencia retrospectiva desde el inicio del curso

**Objetivo:** poder completar o corregir la asistencia de cualquier clase pasada del curso, aunque la materia y su horario se hayan añadido después de que empezara el curso; nunca permitir registrar, corregir o quitar asistencia de fechas posteriores a hoy.

- El curso ya tiene fechas de inicio y fin. Para asignaciones que se consideran vigentes durante todo el curso, calcular la vigencia desde el inicio del curso hasta su fin (o mantener `validUntil` abierto y aplicar el límite del curso al consultar), en lugar de usar hoy como `validFrom`.
- Backend debe hacer que la consulta mensual/devuelta para asistencia incluya las clases programadas entre el inicio del curso y hoy. Mantener la validación de que la fecha de asistencia pertenece al curso y no es futura; una clase futura puede aparecer como horario previsto, pero el endpoint no debe aceptar cambios de asistencia para ella.
- Frontend debe permitir elegir cualquier fecha desde el inicio hasta hoy, abrir Horario por defecto en hoy y dejar deshabilitados los controles de fechas futuras. El calendario debe poder navegar todo el período transcurrido del curso, aunque supere la ventana móvil actual de doce meses.
- No reescribir vigencias de asignaciones históricas que fueron reemplazadas, cerradas o modificadas: conservar la fecha real del cambio para no atribuir retrospectivamente un horario nuevo a un período en que todavía no correspondía. Acordar cómo tratar horarios actuales añadidos tarde antes de implementar el cambio masivo.
- Añadir pruebas para curso ya iniciado con asignación creada después, asistencia pasada válida, fecha futura rechazada, fecha fuera del período del curso rechazada y horario reemplazado que conserva su vigencia histórica.

**Criterio de aceptación:** si el curso empezó antes de hoy, se pueden consultar y registrar clases desde su inicio hasta hoy; desde mañana no se puede registrar, editar ni quitar asistencia. El calendario conserva las fechas reales en que cambiaron las asignaciones.

### Agente de Diseño UX/UI — definir la experiencia

**Objetivo:** dejar claro dónde y cómo se marca asistencia en la interfaz actual, sin inventar una página separada de clases del día ni añadir complejidad innecesaria.

- Revisar la captura y el flujo actual de la sección **Horario**.
- Especificar una presentación simple en la que, tras elegir fecha, cada clase correspondiente a ese día muestre claramente su estado y las acciones **Presente**, **Falta**, **Retardo** y, si ya tiene registro, **Dejar pendiente**.
- Mantener visible la plantilla semanal como referencia, pero diferenciarla de las clases de la fecha seleccionada; proponer textos para evitar que “sin clases hoy” se confunda con “sin horario semanal”.
- Definir estados visuales para pendiente, guardando, guardado y error, y una interacción accesible en escritorio y móvil.
- Entregar indicaciones breves y concretas al agente Frontend. No modificar contratos de API ni decidir cambios de base de datos.

**Aceptación de diseño:** una persona identifica sin ayuda qué clase corresponde a la fecha elegida y dónde marcar cada hora; la propuesta no depende de que las tarjetas de la plantilla recurrente sean registros de asistencia.

### Agente de Backend — coherencia de datos y borrado seguro

**Objetivo:** asegurar que las clases que devuelve la API corresponden al mismo curso, fecha y vigencia que el horario consultado, y permitir eliminar asignaciones equivocadas sin pérdida accidental de historial.

- La consulta semanal ahora excluye fechas fuera del inicio/fin del curso, igual que la mensual. Verificación con PostgreSQL y la API local para el curso `1` y el 22/10/2026: ambas devuelven cuatro clases para el jueves. La discrepancia de la captura no se reprodujo en el backend; Frontend debe comprobar que la petición visible usa ese curso/fecha y que renderiza el resultado recibido.
- Revisar el contrato de `POST /courses/:courseId/schedule`: `validFrom` puede seguir siendo necesario en la API y en PostgreSQL. Documentar claramente esa necesidad para Frontend; el usuario no debe tener que elegir una fecha técnica desde la interfaz.
- **Implementado:** `DELETE /schedule/:entryId/permanent` borra una asignación solo cuando no tiene asistencias; si las tiene responde `409 SCHEDULE_ENTRY_HAS_ATTENDANCE` sin eliminarlas. La operación bloquea la asignación durante la comprobación para evitar concurrencia con escrituras de asistencia. No borra asistencias en cascada ni cambia el comportamiento de “cerrar”.
- Mantener la ruta actual de cierre lógico para finalizar una asignación conservando el historial; definir una ruta o método inequívoco para el borrado definitivo, y documentar ambos contratos en README y aquí.
- Añadir pruebas para asignación sin asistencias (borrado permitido), asignación con asistencias (borrado rechazado y datos preservados), cierre lógico y coherencia de consulta semanal/mensual.
- **Pendiente (asistencia retrospectiva):** permitir consultar las clases desde el inicio del curso aunque la asignación actual se cree después; aceptar asistencia pasada dentro del curso y rechazar fechas futuras o fuera del período. Respetar las vigencias existentes de horarios reemplazados/cerrados y probar ese historial.

**Aceptación de backend:** pruebas automatizadas demuestran que las consultas semanales respetan el período del curso y que el borrado nunca elimina historial de asistencia. La API y PostgreSQL local devolvieron las mismas cuatro clases para la fecha de la captura; la diferencia estaba en el formato de `classDate` al renderizar en Frontend y ya se normaliza.

### Agente de Frontend — simplificar Administración y conectar asistencia

**Objetivo:** que el uso visible coincida con los contratos del backend y con la interacción acordada por Diseño UX/UI.

- **Implementado:** en **Horario**, cargar clases de la fecha elegida y mostrar controles de presente, falta, retardo y dejar pendiente para cada clase. Se distingue el listado del día de la plantilla semanal y se explica que son vistas diferentes.
- **Implementado:** por defecto se abre la fecha de hoy cuando está dentro del período del curso; cada clase de hoy se puede registrar directamente.
- **Implementado:** no se permite registrar, editar ni quitar asistencia para una fecha futura, tanto desde Calendario como desde Horario. Los controles se deshabilitan, se informa al usuario y los manejadores también rechazan la acción.
- **Implementado:** los estados seleccionados de asistencia se distinguen por color: verde para presente, rojo para falta y ámbar para retardo.
- **Implementado:** el calendario permite navegar por doce meses aunque algún mes quede fuera del período del curso; esos meses muestran que no hay clases, sin cambiar ni extender la vigencia del curso.
- **Pendiente:** ampliar la navegación para recorrer todas las fechas del curso hasta hoy y habilitar el registro retrospectivo desde el inicio del curso; el límite actual de doce meses puede dejar fuera parte del curso. Las fechas posteriores a hoy deben seguir sin permitir cambios.
- **Implementado:** consultas usan el curso y la fecha seleccionados; cambiar curso/mes/fecha antes de completar una petición invalida su respuesta antigua. Se mantienen visibles los errores de carga.
- **Implementado:** Administración ya no muestra “Vigente desde”. Envía `validFrom` automáticamente: hoy si el curso ya empezó, inicio del curso si todavía es futuro. No permite añadir clases a cursos finalizados.
- **Implementado:** acciones separadas **Cerrar horario** (conserva historial) y **Borrar** (usa el borrado seguro del backend); el conflicto por asistencias se explica en español.
- **Implementado y probado:** pruebas Vitest cubren alta sin fecha manual, curso futuro, cierre y borrado, conflicto de historial y clases correspondientes a la fecha seleccionada.

**Aceptación de frontend:** se puede seleccionar una fecha, reconocer cada clase de ese día y cambiar cada estado sin afectar las demás; las fechas futuras no permiten cambios; el día actual está listo para registrar al abrir Horario; los estados registrados tienen colores distinguibles. Como trabajo pendiente, permitir elegir todo el período transcurrido del curso para completar asistencias retrospectivas. Crear una asignación no exige introducir la fecha de vigencia; cerrar y borrar son acciones distintas y se explican correctamente.

### Validación compartida

- **Contrato backend conectado:** Frontend usa `DELETE /schedule/:entryId/permanent` y muestra el error 409; para cierre lógico usa `DELETE /schedule/:entryId` con `validUntil`. La discrepancia de clases diarias se reprodujo y se corrigió en Frontend normalizando `classDate`.
- **Verificado localmente:** la consulta real de PostgreSQL/API y la pantalla de Horario muestran las mismas cuatro clases para el jueves 22/10/2026. Vitest reproduce `classDate` como fecha-hora para prevenir la regresión. Sigue pendiente ampliar integración PostgreSQL a otros casos de vigencia y asistencia.
- No añadir Socket.io, nuevas capas, eliminación en cascada ni otras funciones fuera de estos objetivos. CI y respaldos quedan para después, si hacen falta.

- **Implementado:** CRUD de cursos, materias y profesores; creación, consulta, cierre lógico y revisión temporal de asignaciones de horario; consulta mensual de clases derivadas y endpoints REST de asistencia; migraciones PostgreSQL 001 y 002; administración web de catálogos y horarios; pruebas iniciales.
- **Implementado en frontend:** consulta mensual, controles individuales de asistencia por fecha, edición de hora/notas de retardo, dejar pendiente y resumen mensual. La plantilla semanal se muestra separada de la lista diaria; las consultas se protegen frente a cambios rápidos de fecha o curso.
- **Implementado en Administración:** al cambiar el curso, la fecha usada para consultar su horario semanal se ajusta al período del curso seleccionado, evitando reutilizar una fecha fuera del rango del curso anterior.
- **Backend implementado:** la consulta semanal excluye fechas fuera del período del curso; existe borrado definitivo seguro y documentado para asignaciones sin asistencias; pruebas unitarias cubren fechas y protección del historial. La discrepancia de la captura no se reproduce actualmente en la API local: las consultas diaria/mensual y semanal coinciden para el día consultado.
- **Pendiente por agente:** Diseño UX/UI revisa la claridad visual y accesibilidad del flujo actualizado. Frontend ya cubrió los contratos y comportamientos descritos arriba.
- **No confundir:** borrar una asistencia (`DELETE /attendance/...`) la deja pendiente; cerrar una asignación (`DELETE /schedule/:entryId`) la conserva en la base de datos y en el historial; borrado definitivo (`DELETE /schedule/:entryId/permanent`) solo se permite si no hay asistencias.
- **Validación pendiente:** pruebas de integración con PostgreSQL y recorrido real de UX. No añadir Socket.io ni nuevas capas por adelantado.
- **DevOps:** existe Docker Compose local para frontend, backend y PostgreSQL, con persistencia, healthchecks y migración automática sobre un volumen nuevo. Pendiente: CI de GitHub Actions y documentación de despliegue seguro más allá del entorno local.

## Criterios de Aceptación Iniciales

1. Crear y seleccionar un curso actual, y cambiarlo sin perder el acceso a cursos previos.
2. Definir materias y un horario recurrente por día y hora sin crear manualmente las clases diarias.
3. Abrir cada uno de los meses del curso y distinguir el estado de cada clase individual, incluso cuando el mismo día haya presentes, faltas y retardos mezclados.
4. Desde Horario, encontrar fácilmente cada clase de la fecha elegida y marcar, corregir o dejar pendiente cada hora independientemente; Calendario muestra el mismo resultado mensual.
5. Cambiar el horario sin cambiar inadvertidamente el significado de los registros históricos.
6. Mostrar los totales mensuales por estado y materia, y validar fechas y horas inválidas o solapadas.

## Arranque del Backend

Requiere Node.js 24 o posterior y PostgreSQL con las migraciones `001_initial_schema.sql` y `002_teachers_and_schedule.sql` aplicadas. Configura `DATABASE_URL` para desarrollo local; Compose configura `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. El servidor no escucha peticiones si no puede conectar con PostgreSQL.

## Entorno Local con Docker Compose

El único Compose actual, [`docker-compose.yml`](./docker-compose.yml), levanta tres contenedores sencillos: PostgreSQL (`database`), Express (`backend`) y el servidor de desarrollo Vite (`frontend`); no utiliza Nginx. Copia `.env.example` a `.env`, cambia `POSTGRES_PASSWORD` y ejecuta `docker compose up --build -d`. La interfaz queda disponible en `http://localhost:5173` y la API en `http://localhost:3000`; Vite reenvía las solicitudes `/api` al backend. La base de datos no publica puertos al anfitrión. Las migraciones 001 y 002 se ejecutan al crear un volumen PostgreSQL vacío; `postgres_data` conserva los datos entre reinicios. En una base de datos que ya tenga el esquema 001, aplica también `002_teachers_and_schedule.sql` antes de usar profesores y horarios. Más adelante se añadirá por separado la configuración de producción.
