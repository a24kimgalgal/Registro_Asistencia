<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { apiRequest, jsonBody } from '../services/api.js';

const tabs = [
  { id: 'courses', label: 'Cursos' },
  { id: 'subjects', label: 'Materias' },
  { id: 'teachers', label: 'Profesores' },
  { id: 'schedule', label: 'Horario semanal' },
];
const weekdays = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
];

const activeTab = ref('courses');
const courses = ref([]);
const subjects = ref([]);
const teachers = ref([]);
const schedule = ref([]);
const selectedCourseId = ref('');
const scheduleDate = ref(today());
const busy = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const editingCourseId = ref(null);
const editingSubjectId = ref(null);
const editingTeacherId = ref(null);
const editingScheduleId = ref(null);

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function emptyCourse() {
  return { name: '', academicYear: '', startDate: '', endDate: '', isCurrent: false };
}

function emptySubject() {
  return { name: '', color: '' };
}

function emptyTeacher() {
  return { name: '' };
}

function emptySchedule() {
  return {
    subjectId: '',
    teacherId: '',
    weekday: 1,
    startTime: '08:00',
    endTime: '09:00',
    validFrom: scheduleDate.value || today(),
    validUntil: '',
  };
}

const courseForm = reactive(emptyCourse());
const subjectForm = reactive(emptySubject());
const teacherForm = reactive(emptyTeacher());
const scheduleForm = reactive(emptySchedule());
const selectedCourse = computed(() => courses.value.find(
  (course) => String(course.id) === String(selectedCourseId.value),
));
const activeSubjects = computed(() => subjects.value.filter((subject) => subject.isActive));
const availableSubjects = computed(() => subjects.value.filter(
  (subject) => subject.isActive || String(subject.id) === String(scheduleForm.subjectId),
));
const availableTeachers = computed(() => teachers.value.filter(
  (teacher) => teacher.isActive || String(teacher.id) === String(scheduleForm.teacherId),
));

function setMessage(message) {
  errorMessage.value = '';
  successMessage.value = message;
}

function handleError(error) {
  successMessage.value = '';
  errorMessage.value = error.message;
}

async function runAction(action, success) {
  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await action();
    if (success) setMessage(success);
  } catch (error) {
    handleError(error);
  } finally {
    busy.value = false;
  }
}

async function loadCourseData() {
  if (!selectedCourseId.value) {
    subjects.value = [];
    schedule.value = [];
    return;
  }
  loading.value = true;
  try {
    const [subjectResult, scheduleResult] = await Promise.all([
      apiRequest(`/courses/${selectedCourseId.value}/subjects`),
      apiRequest(`/courses/${selectedCourseId.value}/schedule?date=${scheduleDate.value}`),
    ]);
    subjects.value = subjectResult.subjects;
    schedule.value = scheduleResult.schedule;
  } finally {
    loading.value = false;
  }
}

async function loadData(preferredCourseId = selectedCourseId.value) {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [courseResult, teacherResult] = await Promise.all([
      apiRequest('/courses'),
      apiRequest('/teachers'),
    ]);
    courses.value = courseResult.courses;
    teachers.value = teacherResult.teachers;
    const preferredCourse = courses.value.find(
      (course) => String(course.id) === String(preferredCourseId),
    );
    const currentCourse = courses.value.find((course) => course.isCurrent);
    selectedCourseId.value = String(
      preferredCourse?.id ?? currentCourse?.id ?? courses.value[0]?.id ?? '',
    );
    if (selectedCourse.value) {
      const now = today();
      if (now < selectedCourse.value.startDate || now > selectedCourse.value.endDate) {
        scheduleDate.value = selectedCourse.value.startDate;
      }
    }
    scheduleForm.validFrom = scheduleDate.value;
    await loadCourseData();
  } finally {
    loading.value = false;
  }
}

async function changeCourse() {
  if (selectedCourse.value) {
    const now = today();
    if (now < selectedCourse.value.startDate || now > selectedCourse.value.endDate) {
      scheduleDate.value = selectedCourse.value.startDate;
    }
  }
  resetSchedule();
  try {
    await loadCourseData();
  } catch (error) {
    handleError(error);
  }
}

async function changeScheduleDate() {
  resetSchedule();
  try {
    await loadCourseData();
  } catch (error) {
    handleError(error);
  }
}

function refreshData() {
  loadData().catch(handleError);
}

async function saveCourse() {
  const editingId = editingCourseId.value;
  await runAction(async () => {
    let savedCourse;
    if (editingId) {
      savedCourse = await apiRequest(`/courses/${editingId}`, {
        method: 'PATCH',
        body: jsonBody(courseForm),
      });
    } else {
      savedCourse = await apiRequest('/courses', {
        method: 'POST',
        body: jsonBody(courseForm),
      });
    }
    resetCourse();
    await loadData(savedCourse.course.id);
  }, editingId ? 'Curso actualizado.' : 'Curso creado.');
}

function editCourse(course) {
  editingCourseId.value = String(course.id);
  Object.assign(courseForm, {
    name: course.name,
    academicYear: course.academicYear,
    startDate: course.startDate,
    endDate: course.endDate,
    isCurrent: course.isCurrent,
  });
}

function resetCourse() {
  editingCourseId.value = null;
  Object.assign(courseForm, emptyCourse());
}

async function deleteCourse(course) {
  if (!window.confirm(`¿Borrar el curso ${course.name}? Solo se puede si no tiene datos relacionados.`)) return;
  await runAction(async () => {
    await apiRequest(`/courses/${course.id}`, { method: 'DELETE' });
    if (String(selectedCourseId.value) === String(course.id)) selectedCourseId.value = '';
    await loadData();
  }, 'Curso borrado.');
}

async function saveSubject() {
  const editingId = editingSubjectId.value;
  await runAction(async () => {
    if (editingId) {
      await apiRequest(`/subjects/${editingId}`, {
        method: 'PATCH',
        body: jsonBody(subjectForm),
      });
    } else {
      await apiRequest(`/courses/${selectedCourseId.value}/subjects`, {
        method: 'POST',
        body: jsonBody(subjectForm),
      });
    }
    resetSubject();
    await loadCourseData();
  }, editingId ? 'Materia actualizada.' : 'Materia creada.');
}

function editSubject(subject) {
  editingSubjectId.value = String(subject.id);
  Object.assign(subjectForm, { name: subject.name, color: subject.color || '' });
}

function resetSubject() {
  editingSubjectId.value = null;
  Object.assign(subjectForm, emptySubject());
}

async function changeSubjectStatus(subject) {
  const isActive = !subject.isActive;
  await runAction(async () => {
    await apiRequest(`/subjects/${subject.id}`, {
      method: 'PATCH',
      body: jsonBody({ isActive }),
    });
    await loadCourseData();
  }, isActive ? 'Materia reactivada.' : 'Materia desactivada.');
}

async function saveTeacher() {
  const editingId = editingTeacherId.value;
  await runAction(async () => {
    if (editingId) {
      await apiRequest(`/teachers/${editingId}`, {
        method: 'PATCH',
        body: jsonBody(teacherForm),
      });
    } else {
      await apiRequest('/teachers', {
        method: 'POST',
        body: jsonBody(teacherForm),
      });
    }
    resetTeacher();
    const result = await apiRequest('/teachers');
    teachers.value = result.teachers;
  }, editingId ? 'Profesor actualizado.' : 'Profesor creado.');
}

function editTeacher(teacher) {
  editingTeacherId.value = String(teacher.id);
  teacherForm.name = teacher.name;
}

function resetTeacher() {
  editingTeacherId.value = null;
  Object.assign(teacherForm, emptyTeacher());
}

async function changeTeacherStatus(teacher) {
  const isActive = !teacher.isActive;
  await runAction(async () => {
    await apiRequest(`/teachers/${teacher.id}`, {
      method: 'PATCH',
      body: jsonBody({ isActive }),
    });
    const result = await apiRequest('/teachers');
    teachers.value = result.teachers;
  }, isActive ? 'Profesor reactivado.' : 'Profesor desactivado.');
}

async function saveSchedule() {
  const editingId = editingScheduleId.value;
  const { validUntil, ...scheduleFields } = scheduleForm;
  await runAction(async () => {
    if (editingId) {
      scheduleDate.value = validUntil;
      await apiRequest(`/schedule/${editingId}`, {
        method: 'PATCH',
        body: jsonBody({
          ...scheduleFields,
          subjectId: Number(scheduleFields.subjectId),
          teacherId: scheduleFields.teacherId ? Number(scheduleFields.teacherId) : null,
          weekday: Number(scheduleFields.weekday),
          validUntil,
        }),
      });
    } else {
      await apiRequest(`/courses/${selectedCourseId.value}/schedule`, {
        method: 'POST',
        body: jsonBody({
          ...scheduleFields,
          subjectId: Number(scheduleFields.subjectId),
          teacherId: scheduleFields.teacherId ? Number(scheduleFields.teacherId) : null,
          weekday: Number(scheduleFields.weekday),
        }),
      });
    }
    resetSchedule();
    await loadCourseData();
  }, editingId ? 'Horario actualizado desde la fecha indicada.' : 'Clase añadida al horario.');
}

function editSchedule(entry) {
  editingScheduleId.value = String(entry.id);
  Object.assign(scheduleForm, {
    subjectId: String(entry.subjectId),
    teacherId: entry.teacherId ? String(entry.teacherId) : '',
    weekday: entry.weekday,
    startTime: entry.startTime.slice(0, 5),
    endTime: entry.endTime.slice(0, 5),
    validFrom: entry.validFrom,
    validUntil: '',
  });
}

function resetSchedule() {
  editingScheduleId.value = null;
  Object.assign(scheduleForm, emptySchedule());
}

async function closeSchedule(entry) {
  const validUntil = window.prompt(
    'Fecha desde la que termina esta asignación (YYYY-MM-DD):',
    scheduleDate.value,
  );
  if (!validUntil) return;
  await runAction(async () => {
    await apiRequest(`/schedule/${entry.id}`, {
      method: 'DELETE',
      body: jsonBody({ validUntil }),
    });
    await loadCourseData();
  }, 'Asignación cerrada; el historial se conserva.');
}

function weekdayName(value) {
  return weekdays.find((weekday) => weekday.id === value)?.label ?? '';
}

onMounted(() => loadData().catch(handleError));
</script>

<template>
  <section class="admin-panel" aria-labelledby="admin-title">
    <header class="admin-heading">
      <div>
        <p class="eyebrow">GESTIÓN DEL CURSO</p>
        <h2 id="admin-title">Administración</h2>
        <p class="admin-intro">Crea y organiza cursos, materias, profesores y las clases del horario semanal.</p>
      </div>
      <button class="admin-button admin-button--secondary" type="button" :disabled="loading" @click="refreshData">
        Actualizar datos
      </button>
    </header>

    <p v-if="errorMessage" class="admin-feedback admin-feedback--error" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="admin-feedback admin-feedback--success" role="status">{{ successMessage }}</p>
    <p v-if="loading" class="admin-feedback" role="status">Cargando datos…</p>

    <nav class="admin-tabs" aria-label="Administrar recursos">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :class="{ 'admin-tab--active': activeTab === tab.id }"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'courses'" class="admin-content">
      <form class="admin-form" @submit.prevent="saveCourse">
        <h3>{{ editingCourseId ? 'Editar curso' : 'Crear curso' }}</h3>
        <div class="admin-form-grid">
          <label>Nombre<input v-model.trim="courseForm.name" required maxlength="100" placeholder="2 DAW"></label>
          <label>Curso académico<input v-model.trim="courseForm.academicYear" required maxlength="30" placeholder="2026-2027"></label>
          <label>Fecha de inicio<input v-model="courseForm.startDate" type="date" required></label>
          <label>Fecha de fin<input v-model="courseForm.endDate" type="date" required :min="courseForm.startDate"></label>
        </div>
        <label class="admin-checkbox"><input v-model="courseForm.isCurrent" type="checkbox"> Marcar como curso actual</label>
        <div class="admin-form-actions">
          <button class="admin-button" type="submit" :disabled="busy">{{ editingCourseId ? 'Guardar cambios' : 'Crear curso' }}</button>
          <button v-if="editingCourseId" class="admin-button admin-button--secondary" type="button" @click="resetCourse">Cancelar</button>
        </div>
      </form>

      <div class="admin-list">
        <h3>Cursos guardados <span>{{ courses.length }}</span></h3>
        <p v-if="!courses.length" class="admin-empty">Todavía no hay cursos. Crea uno para empezar.</p>
        <article v-for="course in courses" :key="course.id" class="admin-row">
          <div>
            <strong>{{ course.name }}</strong>
            <span>{{ course.academicYear }} · {{ course.startDate }} — {{ course.endDate }}</span>
          </div>
          <span v-if="course.isCurrent" class="admin-badge">Actual</span>
          <div class="admin-row-actions">
            <button class="admin-text-button" type="button" @click="editCourse(course)">Editar</button>
            <button class="admin-text-button admin-text-button--danger" type="button" @click="deleteCourse(course)">Borrar</button>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'subjects'" class="admin-content">
      <label class="admin-course-select">Curso
        <select v-model="selectedCourseId" @change="changeCourse">
          <option value="">Selecciona un curso</option>
          <option v-for="course in courses" :key="course.id" :value="String(course.id)">{{ course.name }} · {{ course.academicYear }}</option>
        </select>
      </label>
      <form v-if="selectedCourse" class="admin-form" @submit.prevent="saveSubject">
        <h3>{{ editingSubjectId ? 'Editar materia' : 'Crear materia' }}</h3>
        <div class="admin-form-grid admin-form-grid--compact">
          <label>Nombre<input v-model.trim="subjectForm.name" required maxlength="100" placeholder="Programación"></label>
          <label>Color (opcional)<input v-model.trim="subjectForm.color" type="color"></label>
        </div>
        <div class="admin-form-actions">
          <button class="admin-button" type="submit" :disabled="busy">{{ editingSubjectId ? 'Guardar cambios' : 'Crear materia' }}</button>
          <button v-if="editingSubjectId" class="admin-button admin-button--secondary" type="button" @click="resetSubject">Cancelar</button>
        </div>
      </form>
      <div v-if="selectedCourse" class="admin-list">
        <h3>Materias de {{ selectedCourse.name }} <span>{{ subjects.length }}</span></h3>
        <p v-if="!subjects.length" class="admin-empty">Este curso todavía no tiene materias.</p>
        <article v-for="subject in subjects" :key="subject.id" class="admin-row">
          <div class="admin-row-title">
            <span class="subject-color" :style="{ backgroundColor: subject.color || '#385e52' }"></span>
            <div><strong>{{ subject.name }}</strong><span>{{ subject.isActive ? 'Activa' : 'Inactiva' }}</span></div>
          </div>
          <div class="admin-row-actions">
            <button class="admin-text-button" type="button" @click="editSubject(subject)">Editar</button>
            <button class="admin-text-button" type="button" @click="changeSubjectStatus(subject)">{{ subject.isActive ? 'Desactivar' : 'Reactivar' }}</button>
          </div>
        </article>
      </div>
      <p v-else class="admin-empty">Crea un curso antes de añadir materias.</p>
    </section>

    <section v-else-if="activeTab === 'teachers'" class="admin-content">
      <form class="admin-form" @submit.prevent="saveTeacher">
        <h3>{{ editingTeacherId ? 'Editar profesor' : 'Crear profesor' }}</h3>
        <label>Nombre<input v-model.trim="teacherForm.name" required maxlength="100" placeholder="Nombre del profesor"></label>
        <div class="admin-form-actions">
          <button class="admin-button" type="submit" :disabled="busy">{{ editingTeacherId ? 'Guardar cambios' : 'Crear profesor' }}</button>
          <button v-if="editingTeacherId" class="admin-button admin-button--secondary" type="button" @click="resetTeacher">Cancelar</button>
        </div>
      </form>
      <div class="admin-list">
        <h3>Profesores <span>{{ teachers.length }}</span></h3>
        <p v-if="!teachers.length" class="admin-empty">Todavía no hay profesores.</p>
        <article v-for="teacher in teachers" :key="teacher.id" class="admin-row">
          <div><strong>{{ teacher.name }}</strong><span>{{ teacher.isActive ? 'Activo' : 'Inactivo' }}</span></div>
          <div class="admin-row-actions">
            <button class="admin-text-button" type="button" @click="editTeacher(teacher)">Editar</button>
            <button class="admin-text-button" type="button" @click="changeTeacherStatus(teacher)">{{ teacher.isActive ? 'Desactivar' : 'Reactivar' }}</button>
          </div>
        </article>
      </div>
    </section>

    <section v-else class="admin-content">
      <label class="admin-course-select">Curso
        <select v-model="selectedCourseId" @change="changeCourse">
          <option value="">Selecciona un curso</option>
          <option v-for="course in courses" :key="course.id" :value="String(course.id)">{{ course.name }} · {{ course.academicYear }}</option>
        </select>
      </label>
      <template v-if="selectedCourse">
        <label class="admin-course-select">Mostrar horario vigente a fecha
          <input v-model="scheduleDate" type="date" required @change="changeScheduleDate">
        </label>
        <form class="admin-form" @submit.prevent="saveSchedule">
          <h3>{{ editingScheduleId ? 'Cambiar asignación' : 'Añadir clase semanal' }}</h3>
          <p class="admin-hint">Si modificas una clase, indica la fecha desde la que se aplica el cambio. La asignación anterior se conserva en el historial.</p>
          <div class="admin-form-grid">
            <label>Materia
              <select v-model="scheduleForm.subjectId" required>
                <option value="">Selecciona una materia</option>
                <option v-for="subject in availableSubjects" :key="subject.id" :value="String(subject.id)">{{ subject.name }}</option>
              </select>
            </label>
            <label>Profesor (opcional)
              <select v-model="scheduleForm.teacherId">
                <option value="">Sin profesor asignado</option>
                <option v-for="teacher in availableTeachers" :key="teacher.id" :value="String(teacher.id)">{{ teacher.name }}</option>
              </select>
            </label>
            <label>Día
              <select v-model.number="scheduleForm.weekday" required>
                <option v-for="weekday in weekdays" :key="weekday.id" :value="weekday.id">{{ weekday.label }}</option>
              </select>
            </label>
            <label>Empieza<input v-model="scheduleForm.startTime" type="time" required></label>
            <label>Termina<input v-model="scheduleForm.endTime" type="time" required></label>
            <label v-if="editingScheduleId">Aplicar cambio desde<input v-model="scheduleForm.validUntil" type="date" :min="scheduleForm.validFrom" required></label>
            <label v-else>Vigente desde<input v-model="scheduleForm.validFrom" type="date" required></label>
          </div>
          <div class="admin-form-actions">
            <button class="admin-button" type="submit" :disabled="busy || !activeSubjects.length">{{ editingScheduleId ? 'Guardar nueva versión' : 'Añadir al horario' }}</button>
            <button v-if="editingScheduleId" class="admin-button admin-button--secondary" type="button" @click="resetSchedule">Cancelar</button>
          </div>
          <p v-if="!activeSubjects.length" class="admin-hint">Crea o activa una materia antes de añadir clases al horario.</p>
        </form>
        <div class="admin-list">
          <h3>Horario de {{ selectedCourse.name }} <span>{{ schedule.length }} clases</span></h3>
          <p v-if="!schedule.length" class="admin-empty">No hay clases vigentes en esta fecha.</p>
          <article v-for="entry in schedule" :key="entry.id" class="admin-row">
            <div>
              <strong>{{ weekdayName(entry.weekday) }} · {{ entry.startTime.slice(0, 5) }}–{{ entry.endTime.slice(0, 5) }}</strong>
              <span>{{ entry.subjectName }} · {{ entry.teacherName || 'Sin profesor' }}</span>
            </div>
            <div class="admin-row-actions">
              <button class="admin-text-button" type="button" @click="editSchedule(entry)">Cambiar</button>
              <button class="admin-text-button admin-text-button--danger" type="button" @click="closeSchedule(entry)">Cerrar</button>
            </div>
          </article>
        </div>
      </template>


      <p v-else class="admin-empty">Crea un curso antes de configurar el horario.</p>
    </section>
  </section>
</template>

<style scoped>
      .admin-panel {
        color: #25362f;
      }

      .admin-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 20px;
      }

      .admin-heading h2 {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 32px;
        font-weight: 400;
      }

      .admin-intro,
      .admin-hint {
        margin: 7px 0 0;
        color: #68766e;
        font-size: 13px;
        line-height: 1.55;
      }

      .admin-feedback {
        border-radius: 9px;
        margin: 12px 0;
        padding: 11px 14px;
        background: #eef2ee;
        color: #52625a;
        font-size: 13px;
      }

      .admin-feedback--error {
        background: #fff0ed;
        color: #a24e40;
      }

      .admin-feedback--success {
        background: #edf6ef;
        color: #397554;
      }

      .admin-tabs {
        display: flex;
        overflow-x: auto;
        gap: 5px;
        border-bottom: 1px solid #e1e7e0;
        margin-bottom: 20px;
      }

      .admin-tabs button,
      .admin-button,
      .admin-text-button {
        border: 0;
        cursor: pointer;
        font: inherit;
      }

      .admin-tabs button {
        border-bottom: 2px solid transparent;
        padding: 11px 15px;
        background: transparent;
        color: #68766e;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
      }

      .admin-tabs button.admin-tab--active {
        border-bottom-color: #385e52;
        color: #385e52;
      }

      .admin-content {
        display: grid;
        gap: 18px;
      }

      .admin-form,
      .admin-list {
        border: 1px solid #e5eae4;
        border-radius: 14px;
        padding: 18px;
        background: #fff;
      }

      .admin-form h3,
      .admin-list h3 {
        display: flex;
        align-items: center;
        gap: 9px;
        margin: 0 0 14px;
        color: #2c3d35;
        font-size: 15px;
        font-weight: 650;
      }

      .admin-list h3 span {
        border-radius: 20px;
        padding: 3px 8px;
        background: #edf2ec;
        color: #52625a;
        font-size: 11px;
        font-weight: 600;
      }

      .admin-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .admin-form-grid--compact {
        grid-template-columns: minmax(0, 1fr) 150px;
      }

      .admin-form label,
      .admin-course-select {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: #52625a;
        font-size: 12px;
        font-weight: 600;
      }

      .admin-form input,
      .admin-form select,
      .admin-course-select input,
      .admin-course-select select {
        width: 100%;
        min-height: 40px;
        border: 1px solid #dce4dc;
        border-radius: 8px;
        padding: 8px 10px;
        background: #fff;
        color: #25362f;
        font: inherit;
        font-size: 13px;
      }

      .admin-form input[type="color"] {
        min-height: 40px;
        padding: 4px;
      }

      .admin-form .admin-checkbox {
        display: flex;
        align-items: center;
        flex-direction: row;
        gap: 8px;
        margin-top: 13px;
        font-weight: 500;
      }

      .admin-checkbox input {
        width: 16px;
        min-height: 16px;
        accent-color: #385e52;
      }

      .admin-form-actions,
      .admin-row-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .admin-form-actions {
        margin-top: 14px;
      }

      .admin-button {
        min-height: 38px;
        border-radius: 8px;
        padding: 0 13px;
        background: #385e52;
        color: white;
        font-size: 12px;
        font-weight: 600;
      }

      .admin-button--secondary {
        border: 1px solid #dce4dc;
        background: #fff;
        color: #52625a;
      }

      .admin-button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      .admin-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-top: 1px solid #edf0ec;
        padding: 12px 0;
      }

      .admin-row > div:first-child,
      .admin-row-title > div {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 4px;
      }

      .admin-row strong {
        color: #34483e;
        font-size: 13px;
        font-weight: 650;
      }

      .admin-row span {
        color: #78857d;
        font-size: 11px;
      }

      .admin-row-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .subject-color {
        width: 12px;
        height: 28px;
        border-radius: 5px;
      }

      .admin-badge {
        border-radius: 20px;
        padding: 5px 9px;
        background: #edf6ef;
        color: #397554 !important;
        font-size: 10px !important;
        font-weight: 650;
      }

      .admin-text-button {
        padding: 6px;
        background: transparent;
        color: #385e52;
        font-size: 11px;
        font-weight: 650;
      }

      .admin-text-button--danger {
        color: #a24e40;
      }

      .admin-empty {
        margin: 0;
        border-top: 1px solid #edf0ec;
        padding-top: 13px;
        color: #78857d;
        font-size: 12px;
      }

      .admin-course-select {
        max-width: 420px;
      }

      .admin-course-select + .admin-course-select {
        margin-top: -8px;
      }

      .admin-hint {
        margin: -6px 0 13px;
        font-size: 11px;
      }

      .admin-button:focus-visible,
      .admin-text-button:focus-visible,
      .admin-tabs button:focus-visible,
      .admin-form input:focus-visible,
      .admin-form select:focus-visible,
      .admin-course-select input:focus-visible,
      .admin-course-select select:focus-visible {
        outline: 3px solid #9bc2ae;
        outline-offset: 2px;
      }

      @media (max-width: 620px) {
        .admin-heading {
          align-items: flex-start;
          flex-direction: column;
        }

        .admin-form-grid,
        .admin-form-grid--compact {
          grid-template-columns: 1fr;
        }

        .admin-row {
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .admin-row-actions {
          margin-left: auto;
        }
      }
</style>
