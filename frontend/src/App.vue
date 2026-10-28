<script setup>
import { computed, onMounted, ref } from 'vue';
import AdminPanel from './components/AdminPanel.vue';
import { apiRequest, jsonBody } from './services/api.js';
import { useHealthStore } from './stores/health.js';

const health = useHealthStore();
const activeSection = ref('Calendario');
const displayedMonth = ref(startOfMonth(new Date()));
const currentMonth = startOfMonth(new Date());
const sections = ['Calendario', 'Materias', 'Horario', 'Administración'];
const courses = ref([]);
const selectedCourseId = ref('');
const classes = ref([]);
const nonTeachingDays = ref([]);
const schedule = ref([]);
const subjects = ref([]);
const selectedDate = ref(dateKey(new Date()));
const selectedClass = ref(null);
const attendanceForm = ref({ status: 'present', arrivedAt: '', notes: '' });
const loadingData = ref(false);
const savingAttendance = ref(false);
const dataError = ref('');
const actionMessage = ref('');
const loadRequestId = ref(0);
const attendanceSummary = [
  { label: 'Presentes', status: 'present' },
  { label: 'Faltas', status: 'absent' },
  { label: 'Retardos', status: 'late' },
  { label: 'Pendientes', status: 'pending' },
];
const attendanceLegend = [
  { label: 'Presente', status: 'present' },
  { label: 'Falta', status: 'absent' },
  { label: 'Retardo', status: 'late' },
  { label: 'Pendiente', status: 'pending' },
];
const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const monthTitle = computed(() => new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
}).format(displayedMonth.value).replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase('es-ES')));
const selectedCourse = computed(() => courses.value.find(
  (course) => String(course.id) === String(selectedCourseId.value),
));
const earliestMonth = computed(() => selectedCourse.value
  ? startOfMonth(courseDate(selectedCourse.value.startDate))
  : addMonths(currentMonth, -6));
const latestMonth = computed(() => selectedCourse.value
  ? startOfMonth(courseDate(selectedCourse.value.endDate))
  : addMonths(currentMonth, 5));
const canGoToPreviousMonth = computed(() => displayedMonth.value > earliestMonth.value);
const canGoToNextMonth = computed(() => displayedMonth.value < latestMonth.value);
const isFutureDate = (date) => date > dateKey(new Date());

const classesByDate = computed(() => classes.value.reduce((grouped, classEntry) => {
  if (nonTeachingDays.value.includes(classEntry.classDate)) return grouped;
  grouped[classEntry.classDate] ??= [];
  grouped[classEntry.classDate].push(classEntry);
  return grouped;
}, {}));
const selectedDateClasses = computed(() => classesByDate.value[selectedDate.value] ?? []);
const attendanceCounts = computed(() => {
  const counts = { present: 0, absent: 0, late: 0, pending: 0 };
  for (const classEntry of classes.value) counts[classEntry.status] += 1;
  return counts;
});
const weeklySchedule = computed(() => weekdays.map((label, index) => ({
  weekday: index + 1,
  label,
  entries: schedule.value.filter((entry) => entry.weekday === index + 1),
})));

const calendarDays = computed(() => {
  const firstOfMonth = displayedMonth.value;
  const lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0);
  const todayKey = dateKey(new Date());
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - mondayOffset);

  const end = new Date(lastOfMonth);
  const weekday = (lastOfMonth.getDay() + 6) % 7;
  end.setDate(lastOfMonth.getDate() + ((4 - weekday + 7) % 7));

  const days = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      days.push({
        key: dateKey(date),
        number: date.getDate(),
        inMonth: date.getMonth() === firstOfMonth.getMonth(),
        isToday: dateKey(date) === todayKey,
        isPast: dateKey(date) < todayKey,
        isFuture: dateKey(date) > todayKey,
        isNonTeachingDay: nonTeachingDays.value.includes(dateKey(date)),
        accessibleDate: new Intl.DateTimeFormat('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(date),
      });
    }
  }
  return days;
});

const calendarWeeks = computed(() => {
  const weeks = [];
  for (let index = 0; index < calendarDays.value.length; index += 5) {
    weeks.push(calendarDays.value.slice(index, index + 5));
  }
  return weeks;
});

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function courseDate(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00`);
}

function changeMonth(amount) {
  const nextMonth = addMonths(displayedMonth.value, amount);
  if (nextMonth < earliestMonth.value || nextMonth > latestMonth.value) return;
  displayedMonth.value = nextMonth;
  const isCourseStartMonth = selectedCourse.value
    && dateKey(nextMonth).slice(0, 7) === String(selectedCourse.value.startDate).slice(0, 7);
  selectedDate.value = isCourseStartMonth
    ? String(selectedCourse.value.startDate).slice(0, 10)
    : dateKey(nextMonth);
  loadCourseData();
}

function goToToday() {
  const today = selectedCourse.value
    ? clampDate(new Date(), selectedCourse.value.startDate, selectedCourse.value.endDate)
    : new Date();
  displayedMonth.value = startOfMonth(today);
  selectedDate.value = dateKey(today);
  loadCourseData();
}

function clampDate(date, startDate, endDate) {
  const dateKeyValue = dateKey(date);
  const startDateKey = String(startDate).slice(0, 10);
  const endDateKey = String(endDate).slice(0, 10);
  if (dateKeyValue < startDateKey) return courseDate(startDateKey);
  if (dateKeyValue > endDateKey) return courseDate(endDateKey);
  return date;
}

async function loadCourses(preferredCourseId = selectedCourseId.value) {
  try {
    const result = await apiRequest('/courses');
    const previousCourseId = selectedCourseId.value;
    courses.value = result.courses;
    const currentCourse = courses.value.find((course) => course.isCurrent) ?? courses.value[0];
    const preferredCourse = courses.value.find(
      (course) => String(course.id) === String(preferredCourseId),
    );
    selectedCourseId.value = String(preferredCourse?.id ?? currentCourse?.id ?? '');
    if (selectedCourse.value) {
      const firstCourseMonth = selectedCourse.value.startDate.slice(0, 7);
      const lastCourseMonth = selectedCourse.value.endDate.slice(0, 7);
      const visibleMonth = dateKey(displayedMonth.value).slice(0, 7);
      if (
        previousCourseId !== selectedCourseId.value
        || visibleMonth < firstCourseMonth
        || visibleMonth > lastCourseMonth
      ) {
        const date = clampDate(new Date(), selectedCourse.value.startDate, selectedCourse.value.endDate);
        displayedMonth.value = startOfMonth(date);
        selectedDate.value = dateKey(date);
      }
    }
    await loadCourseData();
  } catch (error) {
    dataError.value = error.message;
  }
}

async function loadCourseData() {
  selectedClass.value = null;
  actionMessage.value = '';
  const requestId = ++loadRequestId.value;
  if (!selectedCourseId.value) {
    classes.value = [];
    nonTeachingDays.value = [];
    schedule.value = [];
    subjects.value = [];
    loadingData.value = false;
    return;
  }

  const displayedMonthKey = dateKey(displayedMonth.value).slice(0, 7);
  let requestedDate = selectedDate.value;
  if (requestedDate.slice(0, 7) !== displayedMonthKey) {
    requestedDate = calendarDays.value.find((day) => day.inMonth)?.key ?? requestedDate;
  }
  selectedDate.value = requestedDate;

  const courseId = selectedCourseId.value;
  const year = displayedMonth.value.getFullYear();
  const month = String(displayedMonth.value.getMonth() + 1).padStart(2, '0');
  loadingData.value = true;
  dataError.value = '';
  try {
    const [monthResult, scheduleResult, subjectResult] = await Promise.all([
      apiRequest(`/courses/${courseId}/month?year=${year}&month=${month}`),
      apiRequest(`/courses/${courseId}/schedule?date=${requestedDate}`),
      apiRequest(`/courses/${courseId}/subjects`),
    ]);
    if (requestId !== loadRequestId.value) return;
    nonTeachingDays.value = monthResult.nonTeachingDays ?? [];
    classes.value = monthResult.classes.map((classEntry) => ({
      ...classEntry,
      classDate: String(classEntry.classDate).slice(0, 10),
    })).filter((classEntry) => !nonTeachingDays.value.includes(classEntry.classDate));
    schedule.value = scheduleResult.schedule;
    subjects.value = subjectResult.subjects;
  } catch (error) {
    if (requestId !== loadRequestId.value) return;
    dataError.value = error.message;
    classes.value = [];
    nonTeachingDays.value = [];
    schedule.value = [];
    subjects.value = [];
  } finally {
    if (requestId === loadRequestId.value) loadingData.value = false;
  }
}

function selectCourse() {
  if (selectedCourse.value) {
    const date = clampDate(new Date(), selectedCourse.value.startDate, selectedCourse.value.endDate);
    displayedMonth.value = startOfMonth(date);
    selectedDate.value = dateKey(date);
  }
  loadCourseData();
}

function selectAdminCourse(courseId) {
  if (!courseId || String(courseId) === selectedCourseId.value) return;
  selectedCourseId.value = String(courseId);
  if (!courses.value.some((course) => String(course.id) === selectedCourseId.value)) return;
  selectCourse();
}

function navigateTo(section) {
  const previousSection = activeSection.value;
  activeSection.value = section;
  if (section === 'Administración') return;
  if (previousSection === 'Administración') {
    loadCourses();
  } else {
    loadCourseData();
  }
}

function selectDate(date) {
  if (
    selectedCourse.value
    && (
      date < String(selectedCourse.value.startDate).slice(0, 10)
      || date > String(selectedCourse.value.endDate).slice(0, 10)
    )
  ) return;
  selectedDate.value = date;
  selectedClass.value = null;
  if (date.slice(0, 7) !== dateKey(displayedMonth.value).slice(0, 7)) {
    displayedMonth.value = startOfMonth(new Date(`${date}T00:00:00`));
  }
  loadCourseData();
}

function editAttendance(classEntry) {
  if (isFutureDate(classEntry.classDate)) return;
  selectedClass.value = classEntry;
  attendanceForm.value = {
    status: classEntry.status === 'pending' ? 'present' : classEntry.status,
    arrivedAt: classEntry.arrivedAt?.slice(0, 5) ?? '',
    notes: classEntry.notes ?? '',
  };
  actionMessage.value = '';
}

async function saveAttendance() {
  if (!selectedClass.value || isFutureDate(selectedClass.value.classDate)) return;
  savingAttendance.value = true;
  dataError.value = '';
  actionMessage.value = '';
  const { status, arrivedAt, notes } = attendanceForm.value;
  try {
    await apiRequest(
      `/schedule/${selectedClass.value.scheduleEntryId}/attendance/${selectedClass.value.classDate}`,
      {
        method: 'PUT',
        body: jsonBody({
          status,
          arrivedAt: status === 'late' && arrivedAt ? arrivedAt : null,
          notes: notes.trim() || null,
        }),
      },
    );
    await loadCourseData();
    actionMessage.value = `Asistencia guardada: ${statusLabel(status).toLowerCase()}.`;
  } catch (error) {
    dataError.value = error.message;
  } finally {
    savingAttendance.value = false;
  }
}

async function removeAttendance(classEntry) {
  if (isFutureDate(classEntry.classDate)) return;
  savingAttendance.value = true;
  dataError.value = '';
  actionMessage.value = '';
  try {
    await apiRequest(
      `/schedule/${classEntry.scheduleEntryId}/attendance/${classEntry.classDate}`,
      { method: 'DELETE' },
    );
    await loadCourseData();
    actionMessage.value = 'Registro eliminado; la clase queda pendiente.';
  } catch (error) {
    dataError.value = error.message;
  } finally {
    savingAttendance.value = false;
  }
}

async function quickMarkAttendance(classEntry, status) {
  if (isFutureDate(classEntry.classDate)) return;
  if (status === 'late') {
    editAttendance(classEntry);
    attendanceForm.value.status = 'late';
    return;
  }
  savingAttendance.value = true;
  dataError.value = '';
  actionMessage.value = '';
  try {
    await apiRequest(
      `/schedule/${classEntry.scheduleEntryId}/attendance/${classEntry.classDate}`,
      {
        method: 'PUT',
        body: jsonBody({ status }),
      },
    );
    await loadCourseData();
    actionMessage.value = `Asistencia guardada: ${statusLabel(status).toLowerCase()}.`;
  } catch (error) {
    dataError.value = error.message;
  } finally {
    savingAttendance.value = false;
  }
}

async function markDayPresent() {
  const classesToMark = selectedDateClasses.value.filter(
    (classEntry) => classEntry.status !== 'present',
  );
  if (!classesToMark.length || isFutureDate(selectedDate.value)) return;

  savingAttendance.value = true;
  dataError.value = '';
  actionMessage.value = '';
  try {
    const results = await Promise.allSettled(classesToMark.map((classEntry) => apiRequest(
      `/schedule/${classEntry.scheduleEntryId}/attendance/${classEntry.classDate}`,
      {
        method: 'PUT',
        body: jsonBody({ status: 'present' }),
      },
    )));
    await loadCourseData();
    const failedRequest = results.find((result) => result.status === 'rejected');
    if (failedRequest) {
      throw new Error(`No se pudieron marcar todas las clases del día. ${failedRequest.reason.message}`);
    }
    actionMessage.value = 'Asistencia guardada: todas las clases del día marcadas como presentes.';
  } catch (error) {
    dataError.value = error.message;
  } finally {
    savingAttendance.value = false;
  }
}

function formatTime(time) {
  return time?.slice(0, 5) ?? '';
}

function formatCalendarDate(date) {
  if (!date) return 'Selecciona un día';
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function statusLabel(status) {
  return {
    present: 'Presente',
    absent: 'Falta',
    late: 'Retardo',
    pending: 'Pendiente',
  }[status] ?? status;
}

onMounted(() => {
  health.check();
  loadCourses();
});
</script>

<template>
  <v-app>
    <v-main>
      <v-container class="page-shell">
        <header class="top-bar">
          <a class="brand" href="/" aria-label="Registro de Asistencia, inicio">
            <span class="brand-mark" aria-hidden="true">R</span>
            <span>Registro <span class="brand-light">de Asistencia</span></span>
          </a>
        </header>

        <main class="dashboard">
          <section class="welcome">
            <p class="eyebrow">SEGUIMIENTO DEL CURSO</p>
            <h1>Consulta y registra tus clases</h1>
            <p class="welcome-copy">
              Elige un curso y un día para revisar o marcar la asistencia.
            </p>
          </section>

          <nav class="primary-nav" aria-label="Navegación principal">
            <v-btn
              v-for="section in sections"
              :key="section"
              :variant="activeSection === section ? 'flat' : 'text'"
              :color="activeSection === section ? 'primary' : undefined"
              :aria-current="activeSection === section ? 'page' : undefined"
              @click="navigateTo(section)"
            >
              {{ section }}
            </v-btn>
          </nav>

          <label v-if="activeSection !== 'Administración'" class="course-picker">
            Curso
            <select v-model="selectedCourseId" :disabled="!courses.length" @change="selectCourse">
              <option value="">Selecciona un curso</option>
              <option v-for="course in courses" :key="course.id" :value="String(course.id)">
                {{ course.name }} · {{ course.academicYear }}
              </option>
            </select>
          </label>

          <p v-if="dataError" class="data-feedback data-feedback--error" role="alert">
            {{ dataError }}
          </p>
          <p v-if="actionMessage" class="data-feedback" role="status">{{ actionMessage }}</p>

          <template v-if="activeSection === 'Calendario'">
            <section class="month-toolbar" aria-label="Navegación del calendario">
              <div>
                <p class="eyebrow">CALENDARIO DEL CURSO</p>
                <h2 class="month-title" aria-live="polite">{{ monthTitle }}</h2>
              </div>
              <div class="month-controls">
                <v-btn
                  variant="outlined"
                  rounded="lg"
                  aria-label="Mes anterior"
                  :disabled="!canGoToPreviousMonth"
                  @click="changeMonth(-1)"
                >
                  <span aria-hidden="true">‹</span>
                  <span class="control-label">Anterior</span>
                </v-btn>
                <v-btn
                  variant="tonal"
                  color="primary"
                  rounded="lg"
                  :disabled="displayedMonth.getTime() === currentMonth.getTime()"
                  @click="goToToday"
                >
                  Hoy
                </v-btn>
                <v-btn
                  variant="outlined"
                  rounded="lg"
                  aria-label="Mes siguiente"
                  :disabled="!canGoToNextMonth"
                  @click="changeMonth(1)"
                >
                  <span class="control-label">Siguiente</span>
                  <span aria-hidden="true">›</span>
                </v-btn>
              </div>
            </section>

            <section class="summary-section" aria-labelledby="summary-heading">
              <div class="section-heading">
                <h2 id="summary-heading">Resumen del mes</h2>
                <span class="summary-note">
                  {{ selectedCourse?.name ?? 'Selecciona un curso' }} · {{ classes.length }} clases
                </span>
              </div>
              <div class="summary-grid">
                <article
                  v-for="item in attendanceSummary"
                  :key="item.status"
                  class="summary-card"
                  :class="`summary-card--${item.status}`"
                >
                  <span class="summary-value">{{ attendanceCounts[item.status] }}</span>
                  <span class="summary-label">{{ item.label }}</span>
                </article>
              </div>
            </section>

            <section class="calendar-section" aria-labelledby="calendar-heading">
              <div class="section-heading calendar-section-heading">
                <h2 id="calendar-heading">Clases de {{ monthTitle }}</h2>
                <div class="calendar-date-legend" aria-label="Referencias de fechas">
                  <span><i class="calendar-date-marker calendar-date-marker--past" aria-hidden="true"></i>Día pasado</span>
                  <span><i class="calendar-date-marker calendar-date-marker--today" aria-hidden="true"></i>Hoy</span>
                  <span><i class="calendar-date-marker calendar-date-marker--future" aria-hidden="true"></i>Fecha futura · solo consulta</span>
                  <span><i class="calendar-date-marker calendar-date-marker--holiday" aria-hidden="true"></i>Festivo</span>
                </div>
              </div>

              <p v-if="loadingData" class="data-feedback" role="status">Cargando clases…</p>
              <div class="calendar-grid" role="grid" :aria-label="`Calendario de ${monthTitle}`">
                <div class="calendar-week calendar-week--heading" role="row">
                  <div
                    v-for="weekday in weekdays"
                    :key="weekday"
                    class="weekday-cell"
                    role="columnheader"
                  >
                    {{ weekday }}
                  </div>
                </div>
                <div
                  v-for="week in calendarWeeks"
                  :key="week[0].key"
                  class="calendar-week"
                  role="row"
                >
                  <div
                    v-for="day in week"
                    :key="day.key"
                    class="calendar-day"
                    :class="{ 'calendar-day--outside': !day.inMonth }"
                    role="gridcell"
                    :aria-label="`${day.accessibleDate}${day.isToday ? ', hoy' : ''}${day.isNonTeachingDay ? ', festivo' : ''}${day.isFuture ? ', fecha futura, solo consulta' : ''}${day.inMonth ? '' : ', fuera del mes seleccionado'}`"
                  >
                    <button
                      class="calendar-day-button"
                      :class="{
                        'calendar-day-button--selected': selectedDate === day.key,
                        'calendar-day-button--today': day.isToday,
                        'calendar-day-button--past': day.isPast,
                        'calendar-day-button--future': day.isFuture,
                      }"
                      type="button"
                      :disabled="selectedCourse && (day.key < String(selectedCourse.startDate).slice(0, 10) || day.key > String(selectedCourse.endDate).slice(0, 10))"
                      :aria-pressed="selectedDate === day.key"
                      @click="selectDate(day.key)"
                    >
                      <time :datetime="day.key">{{ day.number }}</time>
                      <span v-if="day.isNonTeachingDay" class="calendar-holiday-label">
                        FIESTA
                      </span>
                      <template v-else>
                        <span v-if="classesByDate[day.key]" class="calendar-day-count">
                          {{ classesByDate[day.key].length }}
                          {{ classesByDate[day.key].length === 1 ? 'clase' : 'clases' }}
                        </span>
                        <span
                          v-if="classesByDate[day.key]"
                          class="calendar-day-statuses"
                          :aria-label="classesByDate[day.key].map((entry) => statusLabel(entry.status)).join(', ')"
                        >
                          <i
                            v-for="classEntry in classesByDate[day.key]"
                            :key="classEntry.scheduleEntryId"
                            class="legend-dot"
                            :class="`legend-dot--${classEntry.status}`"
                            aria-hidden="true"
                          ></i>
                        </span>
                      </template>
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="!selectedCourse" class="empty-state" role="status">
                <span class="empty-state-mark" aria-hidden="true">+</span>
                <div>
                  <h3>Selecciona o crea un curso</h3>
                  <p>
                    Las clases aparecerán aquí cuando el curso tenga asignaciones de
                    horario configuradas en Administración.
                  </p>
                </div>
              </div>
              <div v-else-if="!loadingData && !classes.length" class="empty-state" role="status">
                <span class="empty-state-mark" aria-hidden="true">+</span>
                <div>
                  <h3>No hay clases programadas este mes</h3>
                  <p>Comprueba las asignaciones del curso en Administración. No se generan faltas automáticamente.</p>
                </div>
              </div>

              <section v-if="selectedCourse" class="day-classes" aria-live="polite">
                <div class="section-heading">
                  <h3>{{ formatCalendarDate(selectedDate) }}</h3>
                  <div class="selected-day-actions">
                    <span v-if="nonTeachingDays.includes(selectedDate)" class="calendar-holiday-label">
                      FIESTA
                    </span>
                    <span v-else class="weekday-note">{{ selectedDateClasses.length }} clases</span>
                    <v-btn
                      v-if="selectedDateClasses.length"
                      color="primary"
                      variant="outlined"
                      rounded="lg"
                      :disabled="savingAttendance || isFutureDate(selectedDate) || selectedDateClasses.every((classEntry) => classEntry.status === 'present')"
                      @click="markDayPresent"
                    >
                      Marcar todo el día como presente
                    </v-btn>
                    <v-btn
                      v-if="!nonTeachingDays.includes(selectedDate)"
                      color="primary"
                      variant="tonal"
                      rounded="lg"
                      @click="navigateTo('Horario')"
                    >
                      {{ isFutureDate(selectedDate) ? 'Ver horario del día' : 'Marcar asistencia' }}
                    </v-btn>
                  </div>
                </div>
                <p v-if="isFutureDate(selectedDate)" class="future-date-note" role="status">
                  Puedes consultar este día, pero la asistencia solo se puede cambiar hasta hoy.
                </p>
                <p v-if="nonTeachingDays.includes(selectedDate)" class="holiday-date-note" role="status">
                  Día festivo. No hay clases ni asistencia que registrar.
                </p>
                <p v-else-if="!selectedDateClasses.length" class="admin-empty">
                  No hay clases para esta fecha. La plantilla semanal de abajo muestra el horario recurrente del curso.
                </p>
                <article
                  v-for="classEntry in selectedDateClasses"
                  :key="`${classEntry.scheduleEntryId}-${classEntry.classDate}`"
                  class="day-class-card"
                >
                  <div class="day-class-info">
                    <strong>{{ formatTime(classEntry.startTime) }}–{{ formatTime(classEntry.endTime) }} · {{ classEntry.subjectName }}</strong>
                    <span>{{ classEntry.teacherName || 'Sin profesor asignado' }}</span>
                    <span class="attendance-status" :class="`attendance-status--${classEntry.status}`">
                      {{ statusLabel(classEntry.status) }}
                    </span>
                  </div>
                  <div class="day-class-actions">
                    <button
                      class="admin-button"
                      type="button"
                      :disabled="isFutureDate(classEntry.classDate)"
                      @click="editAttendance(classEntry)"
                    >
                      {{ classEntry.status === 'pending' ? 'Registrar' : 'Editar' }}
                    </button>
                    <button
                      v-if="classEntry.status !== 'pending'"
                      class="admin-button admin-button--secondary"
                      type="button"
                      :disabled="savingAttendance || isFutureDate(classEntry.classDate)"
                      @click="removeAttendance(classEntry)"
                    >
                      Quitar registro
                    </button>
                  </div>
                  <form
                    v-if="selectedClass?.scheduleEntryId === classEntry.scheduleEntryId && selectedClass?.classDate === classEntry.classDate"
                    class="attendance-form"
                    @submit.prevent="saveAttendance"
                  >
                    <label>Estado
                      <select v-model="attendanceForm.status">
                        <option value="present">Presente</option>
                        <option value="absent">Falta</option>
                        <option value="late">Retardo</option>
                      </select>
                    </label>
                    <label v-if="attendanceForm.status === 'late'">Hora de llegada
                      <input v-model="attendanceForm.arrivedAt" type="time">
                    </label>
                    <label class="attendance-notes">Notas (opcional)
                      <input v-model.trim="attendanceForm.notes" maxlength="500">
                    </label>
                    <div class="admin-form-actions">
                      <button
                        class="admin-button"
                        type="submit"
                        :disabled="savingAttendance || isFutureDate(classEntry.classDate)"
                      >
                        {{ savingAttendance ? 'Guardando…' : 'Guardar asistencia' }}
                      </button>
                      <button class="admin-button admin-button--secondary" type="button" @click="selectedClass = null">
                        Cancelar
                      </button>
                    </div>
                  </form>
                </article>
              </section>
            </section>

            <section class="legend" aria-labelledby="legend-heading">
              <h2 id="legend-heading">Estados de asistencia</h2>
              <ul>
                <li v-for="item in attendanceLegend" :key="item.status">
                  <span
                    class="legend-dot"
                    :class="`legend-dot--${item.status}`"
                    aria-hidden="true"
                  ></span>
                  {{ item.label }}
                </li>
              </ul>
              <p>Una clase sin registro se mostrará como pendiente, nunca como falta.</p>
            </section>
          </template>

          <section v-else-if="activeSection === 'Horario'" class="calendar-section" aria-labelledby="weekly-heading">
            <div class="section-heading calendar-section-heading">
              <div>
                <p class="eyebrow">PLANTILLA RECURRENTE</p>
                <h2 id="weekly-heading">Horario semanal</h2>
              </div>
              <v-btn color="primary" variant="tonal" rounded="lg" @click="activeSection = 'Administración'">
                Editar horario
              </v-btn>
            </div>
            <p v-if="loadingData" class="data-feedback" role="status">Cargando horario…</p>
            <label v-if="selectedCourse" class="course-picker">
              Fecha de asistencia
              <input
                v-model="selectedDate"
                type="date"
                :min="String(selectedCourse.startDate).slice(0, 10)"
                :max="String(selectedCourse.endDate).slice(0, 10)"
                @change="selectDate(selectedDate)"
              >
            </label>
            <section v-if="selectedCourse" class="day-classes" aria-live="polite">
              <div class="section-heading">
                <h3>Clases del {{ formatCalendarDate(selectedDate) }}</h3>
                <span class="weekday-note">Marca cada hora por separado</span>
              </div>
              <p v-if="isFutureDate(selectedDate)" class="future-date-note" role="status">
                Puedes consultar este día, pero la asistencia solo se puede cambiar hasta hoy.
              </p>
              <p v-if="!selectedDateClasses.length" class="admin-empty">
                No hay clases programadas para este día.
              </p>
              <article
                v-for="classEntry in selectedDateClasses"
                :key="`${classEntry.scheduleEntryId}-${classEntry.classDate}`"
                class="day-class-card"
              >
                <div class="day-class-info">
                  <strong>{{ formatTime(classEntry.startTime) }}–{{ formatTime(classEntry.endTime) }} · {{ classEntry.subjectName }}</strong>
                  <span>{{ classEntry.teacherName || 'Sin profesor asignado' }}</span>
                  <span class="attendance-status" :class="`attendance-status--${classEntry.status}`">
                    {{ statusLabel(classEntry.status) }}
                  </span>
                </div>
                <div class="quick-attendance-actions" :aria-label="`Asistencia para ${classEntry.subjectName}`">
                  <button
                    v-for="option in attendanceLegend.slice(0, 3)"
                    :key="option.status"
                    class="admin-button"
                    :class="[
                      { 'admin-button--secondary': classEntry.status !== option.status },
                      classEntry.status === option.status ? `attendance-option--selected--${option.status}` : '',
                    ]"
                    type="button"
                    :aria-pressed="classEntry.status === option.status"
                    :disabled="savingAttendance || classEntry.status === option.status || isFutureDate(classEntry.classDate)"
                    @click="quickMarkAttendance(classEntry, option.status)"
                  >
                    {{ option.label }}
                  </button>
                  <button
                    v-if="classEntry.status !== 'pending'"
                    class="admin-button admin-button--secondary"
                    type="button"
                    :disabled="savingAttendance || isFutureDate(classEntry.classDate)"
                    @click="removeAttendance(classEntry)"
                  >
                    Dejar pendiente
                  </button>
                  <button
                    v-if="classEntry.status === 'late'"
                    class="admin-text-button"
                    type="button"
                    :disabled="isFutureDate(classEntry.classDate)"
                    @click="editAttendance(classEntry)"
                  >
                    Editar hora/notas
                  </button>
                </div>
                <form
                  v-if="selectedClass?.scheduleEntryId === classEntry.scheduleEntryId && selectedClass?.classDate === classEntry.classDate"
                  class="attendance-form"
                  @submit.prevent="saveAttendance"
                >
                  <label>Hora de llegada (opcional)
                    <input v-model="attendanceForm.arrivedAt" type="time">
                  </label>
                  <label class="attendance-notes">Notas (opcional)
                    <input v-model.trim="attendanceForm.notes" maxlength="500">
                  </label>
                  <div class="admin-form-actions">
                    <button class="admin-button" type="submit" :disabled="savingAttendance">
                      {{ savingAttendance ? 'Guardando…' : 'Guardar retardo' }}
                    </button>
                    <button class="admin-button admin-button--secondary" type="button" @click="selectedClass = null">
                      Cancelar
                    </button>
                  </div>
                </form>
              </article>
            </section>
            <div v-if="selectedCourse" class="weekly-grid">
              <section v-for="day in weeklySchedule" :key="day.weekday" class="weekly-day">
                <h3>{{ day.label }}</h3>
                <article
                  v-for="entry in day.entries"
                  :key="entry.id"
                  class="weekly-entry"
                  :style="{ '--subject-color': entry.subjectColor || '#385e52' }"
                >
                  <strong>{{ formatTime(entry.startTime) }}–{{ formatTime(entry.endTime) }}</strong>
                  <span>{{ entry.subjectName }}</span>
                  <small>{{ entry.teacherName || 'Sin profesor asignado' }}</small>
                </article>
                <p v-if="!day.entries.length" class="weekly-empty">Sin clases</p>
              </section>
            </div>
            <div v-else class="empty-state" role="status">
              <div>
                <h3>Selecciona o crea un curso</h3>
                <p>Después asigna materias, días y horas desde Administración para ver el horario semanal.</p>
              </div>
            </div>
            <p class="range-note">
              Se muestran las asignaciones vigentes para {{ selectedCourse?.name ?? 'el curso seleccionado' }}.
              Los horarios se configuran en Administración; no se crean horas automáticamente.
            </p>
          </section>

          <section v-else-if="activeSection === 'Materias'" class="calendar-section" aria-labelledby="subjects-heading">
            <div class="section-heading calendar-section-heading">
              <div>
                <p class="eyebrow">CATÁLOGO DEL CURSO</p>
                <h2 id="subjects-heading">Materias</h2>
              </div>
              <v-btn color="primary" variant="tonal" rounded="lg" @click="activeSection = 'Administración'">
                Gestionar materias
              </v-btn>
            </div>
            <div v-if="subjects.length" class="subject-list">
              <article v-for="subject in subjects" :key="subject.id" class="subject-card">
                <span class="subject-color" :style="{ backgroundColor: subject.color || '#385e52' }"></span>
                <div>
                  <strong>{{ subject.name }}</strong>
                  <span>{{ subject.isActive ? 'Activa' : 'Inactiva' }}</span>
                </div>
                <span class="subject-class-count">
                  {{ classes.filter((entry) => String(entry.subjectId) === String(subject.id)).length }} clases este mes
                </span>
              </article>
            </div>
            <div v-else-if="selectedCourse && !loadingData" class="empty-state" role="status">
              <div>
                <h3>No hay materias para este curso</h3>
                <p>Añade materias desde Administración para organizarlas en el horario.</p>
              </div>
            </div>
            <div v-else-if="!selectedCourse" class="empty-state" role="status">
              <div><h3>Selecciona o crea un curso</h3></div>
            </div>
          </section>

          <AdminPanel
            v-else-if="activeSection === 'Administración'"
            :selected-course-id="selectedCourseId"
            @course-selected="selectAdminCourse"
            @courses-changed="loadCourses"
          />

          <section v-else class="section-placeholder" aria-live="polite">
            <p class="eyebrow">{{ activeSection.toLocaleUpperCase('es-ES') }}</p>
            <h2>{{ activeSection }} del curso</h2>
            <p>
              Gestiona {{ activeSection.toLocaleLowerCase('es-ES') }} desde la sección de administración.
              No hay información para mostrar todavía.
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              rounded="lg"
              @click="activeSection = 'Administración'"
            >
              Abrir administración
            </v-btn>
          </section>

          <section class="connection-card" aria-labelledby="connection-heading">
            <div class="connection-copy">
              <p class="eyebrow">ESTADO DEL SISTEMA</p>
              <h2 id="connection-heading">Conexión con el servidor</h2>
              <p
                class="status-message"
                :class="`status-message--${health.status}`"
                role="status"
                aria-live="polite"
              >
                {{ health.message }}
              </p>
              <p class="connection-detail">
                La API permite administrar cursos, materias, profesores y horario semanal.
                El calendario y el horario semanal se cargan desde los datos del curso seleccionado.
              </p>
            </div>
            <v-btn
              color="primary"
              variant="tonal"
              rounded="lg"
              :loading="health.status === 'loading'"
              :disabled="health.status === 'loading'"
              @click="health.check()"
            >
              Reintentar conexión
            </v-btn>
          </section>
        </main>

        <footer class="page-footer">
          <span>Registro de Asistencia</span>
          <span>Una cosa a la vez.</span>
        </footer>
      </v-container>
    </v-main>
  </v-app>
</template>
