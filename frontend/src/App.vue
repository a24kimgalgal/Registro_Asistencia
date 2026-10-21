<script setup>
import { computed, onMounted, ref } from 'vue';
import { useHealthStore } from './stores/health.js';

const health = useHealthStore();
const activeSection = ref('Calendario');
const displayedMonth = ref(startOfMonth(new Date()));
const currentMonth = startOfMonth(new Date());
const earliestMonth = addMonths(currentMonth, -6);
const latestMonth = addMonths(currentMonth, 5);
const sections = ['Calendario', 'Materias', 'Horario'];
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

const calendarDays = computed(() => {
  const firstOfMonth = displayedMonth.value;
  const lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0);
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

const canGoToPreviousMonth = computed(() => displayedMonth.value > earliestMonth);
const canGoToNextMonth = computed(() => displayedMonth.value < latestMonth);
const isAtMonthLimit = computed(() => (
  !canGoToPreviousMonth.value || !canGoToNextMonth.value
));

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function changeMonth(amount) {
  const nextMonth = addMonths(displayedMonth.value, amount);
  if (nextMonth < earliestMonth || nextMonth > latestMonth) return;
  displayedMonth.value = nextMonth;
}

function goToToday() {
  displayedMonth.value = currentMonth;
}

onMounted(() => {
  health.check();
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
          <div class="course-actions">
            <v-btn
              class="course-selector"
              variant="outlined"
              rounded="lg"
              disabled
              aria-label="Sin curso seleccionado"
            >
              Sin curso seleccionado
            </v-btn>
            <v-btn
              class="course-config"
              color="primary"
              variant="tonal"
              rounded="lg"
              disabled
            >
              Configurar curso
            </v-btn>
          </div>
        </header>

        <main class="dashboard">
          <section class="welcome">
            <p class="eyebrow">ORGANIZACIÓN, DÍA A DÍA</p>
            <h1>Tu asistencia, con todo en su lugar.</h1>
            <p class="welcome-copy">
              Consulta tus clases y lleva el seguimiento del curso, día a día.
            </p>
          </section>

          <nav class="primary-nav" aria-label="Navegación principal">
            <v-btn
              v-for="section in sections"
              :key="section"
              :variant="activeSection === section ? 'flat' : 'text'"
              :color="activeSection === section ? 'primary' : undefined"
              :aria-current="activeSection === section ? 'page' : undefined"
              @click="activeSection = section"
            >
              {{ section }}
            </v-btn>
          </nav>

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

            <p v-if="isAtMonthLimit" class="range-note">
              Puedes consultar hasta 12 meses en esta vista. El límite exacto del
              curso estará disponible al conectar la gestión de cursos.
            </p>

            <section class="summary-section" aria-labelledby="summary-heading">
              <div class="section-heading">
                <h2 id="summary-heading">Resumen del mes</h2>
                <span class="summary-note">Disponible al conectar los datos del curso</span>
              </div>
              <div class="summary-grid">
                <article
                  v-for="item in attendanceSummary"
                  :key="item.status"
                  class="summary-card"
                  :class="`summary-card--${item.status}`"
                >
                  <span class="summary-value" aria-label="Sin datos">—</span>
                  <span class="summary-label">{{ item.label }}</span>
                </article>
              </div>
            </section>

            <section class="calendar-section" aria-labelledby="calendar-heading">
              <div class="section-heading calendar-section-heading">
                <h2 id="calendar-heading">Clases de {{ monthTitle }}</h2>
                <span class="weekday-note">De lunes a viernes</span>
              </div>

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
                    :aria-label="`${day.accessibleDate}${day.inMonth ? '' : ', fuera del mes seleccionado'}`"
                  >
                    <time :datetime="day.key">{{ day.number }}</time>
                  </div>
                </div>
              </div>

              <div class="empty-state" role="status">
                <span class="empty-state-mark" aria-hidden="true">+</span>
                <div>
                  <h3>Primero, configura tu curso</h3>
                  <p>
                    No hay ningún curso seleccionado. Cuando esté disponible la
                    gestión de cursos, podrás crear uno o elegirlo aquí. No se
                    muestran clases ni asistencias de ejemplo.
                  </p>
                </div>
              </div>
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

          <section v-else class="section-placeholder" aria-live="polite">
            <p class="eyebrow">{{ activeSection.toLocaleUpperCase('es-ES') }}</p>
            <h2>{{ activeSection }} del curso</h2>
            <p>
              Esta sección estará disponible cuando se implemente la gestión del
              curso. No hay información para mostrar todavía.
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              rounded="lg"
              @click="activeSection = 'Calendario'"
            >
              Volver al calendario
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
                La API actual solo permite comprobar la conexión. Los datos del
                calendario todavía no están disponibles.
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
