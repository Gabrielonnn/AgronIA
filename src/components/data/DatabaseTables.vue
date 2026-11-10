<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Card from '../ui/Card.vue'
import { supabase } from '../../services/supabase'

const tables = [
  { name: 'fields', label: 'Parcelas' },
  { name: 'crops', label: 'Catálogo de cultivos' },
  { name: 'field_crops', label: 'Cultivos por parcela' },
  { name: 'devices', label: 'Dispositivos' },
  { name: 'field_metrics', label: 'Métricas de campo' },
  { name: 'ai_alerts', label: 'Alertas IA' },
  { name: 'treatments', label: 'Tratamientos' },
  { name: 'simulations', label: 'Simulaciones' },
  { name: 'map_elements', label: 'Elementos del mapa' },
  { name: 'satellite_imagery', label: 'Imágenes satelitales' },
  { name: 'map_layers', label: 'Capas del mapa' },
  { name: 'profiles', label: 'Perfiles (solo lectura)' },
  { name: 'user_logs', label: 'Bitácora (solo lectura)' },
] as const

type TableName = typeof tables[number]['name']
type DatabaseRow = Record<string, unknown> & { id?: string }

const readOnlyTables = new Set<TableName>(['profiles', 'user_logs'])
const selectedTable = ref<TableName>('fields')
const records = ref<DatabaseRow[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const statusMessage = ref('')
const newRecordJson = ref('{\n  \n}')
const editingId = ref<string | null>(null)
const editingJson = ref('')

const selectedLabel = computed(() =>
  tables.find(table => table.name === selectedTable.value)?.label ?? selectedTable.value
)
const isReadOnly = computed(() => readOnlyTables.has(selectedTable.value))

const loadRecords = async () => {
  if (!supabase) {
    errorMessage.value = 'Supabase no está configurado. Revisa las variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.'
    return
  }

  loading.value = true
  errorMessage.value = ''
  editingId.value = null

  const { data, error } = await supabase
    .from(selectedTable.value)
    .select('*')
    .limit(100)

  if (error) {
    errorMessage.value = `No se pudo consultar ${selectedTable.value}: ${error.message}`
    records.value = []
  } else {
    records.value = (data ?? []) as DatabaseRow[]
  }
  loading.value = false
}

watch(selectedTable, () => {
  statusMessage.value = ''
  loadRecords()
})
onMounted(loadRecords)

const parseRecord = (value: string): DatabaseRow | null => {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errorMessage.value = 'El registro debe ser un objeto JSON, por ejemplo: {"name":"Parcela norte"}.'
      return null
    }
    return parsed as DatabaseRow
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? `JSON inválido: ${error.message}`
      : 'El registro no contiene JSON válido.'
    return null
  }
}

const createRecord = async () => {
  if (!supabase || isReadOnly.value) return
  errorMessage.value = ''
  statusMessage.value = ''
  const record = parseRecord(newRecordJson.value)
  if (!record) return

  saving.value = true
  const { error } = await supabase.from(selectedTable.value).insert(record)
  saving.value = false

  if (error) {
    errorMessage.value = `No se pudo crear el registro: ${error.message}`
    return
  }

  newRecordJson.value = '{\n  \n}'
  statusMessage.value = 'Registro creado.'
  await loadRecords()
}

const startEditing = (record: DatabaseRow) => {
  if (isReadOnly.value || typeof record.id !== 'string') return
  editingId.value = record.id
  editingJson.value = JSON.stringify(record, null, 2)
  errorMessage.value = ''
}

const saveRecord = async () => {
  if (!supabase || !editingId.value || isReadOnly.value) return
  errorMessage.value = ''
  statusMessage.value = ''
  const record = parseRecord(editingJson.value)
  if (!record) return
  delete record.id

  saving.value = true
  const { data, error } = await supabase
    .from(selectedTable.value)
    .update(record)
    .eq('id', editingId.value)
    .select('id')
  saving.value = false

  if (error) {
    errorMessage.value = `No se pudo actualizar el registro: ${error.message}`
    return
  }
  if (!data?.length) {
    errorMessage.value = 'No se actualizó ningún registro. Comprueba el identificador y los permisos RLS.'
    return
  }

  editingId.value = null
  statusMessage.value = 'Registro actualizado.'
  await loadRecords()
}

const deleteRecord = async (record: DatabaseRow) => {
  if (!supabase || isReadOnly.value || typeof record.id !== 'string') return
  if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return

  errorMessage.value = ''
  statusMessage.value = ''
  const { data, error } = await supabase
    .from(selectedTable.value)
    .delete()
    .eq('id', record.id)
    .select('id')

  if (error) {
    errorMessage.value = `No se pudo eliminar el registro: ${error.message}`
    return
  }
  if (!data?.length) {
    errorMessage.value = 'No se eliminó ningún registro. Comprueba el identificador y los permisos RLS.'
    return
  }

  statusMessage.value = 'Registro eliminado.'
  await loadRecords()
}
</script>

<template>
  <Card>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold text-gray-900">Tablas de Supabase</h2>
          <p class="mt-1 text-xs text-gray-500">Consulta y administra registros respetando las políticas RLS del proyecto.</p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-agron-green"
          :disabled="loading"
          @click="loadRecords"
        >
          {{ loading ? 'Cargando…' : 'Actualizar' }}
        </button>
      </div>
    </template>

    <div class="space-y-5">
      <div class="flex flex-wrap gap-2" aria-label="Seleccionar tabla">
        <button
          v-for="table in tables"
          :key="table.name"
          type="button"
          class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="selectedTable === table.name
            ? 'border-agron-green bg-agron-green-light text-agron-green-dark'
            : 'border-gray-200 text-gray-600 hover:border-agron-green'"
          @click="selectedTable = table.name"
        >
          {{ table.label }}
        </button>
      </div>

      <div v-if="errorMessage" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
        {{ errorMessage }}
      </div>
      <div v-if="statusMessage" class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700" role="status">
        {{ statusMessage }}
      </div>

      <div v-if="!isReadOnly" class="rounded-xl border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-800">Nuevo registro · {{ selectedLabel }}</h3>
        <p class="mt-1 text-xs text-gray-500">Escribe las columnas de la tabla como un objeto JSON. Los identificadores y campos obligatorios dependen del esquema de Supabase.</p>
        <textarea
          v-model="newRecordJson"
          rows="5"
          class="mt-3 w-full rounded-lg border border-gray-300 p-3 font-mono text-xs focus:border-agron-green focus:outline-none focus:ring-2 focus:ring-agron-green/20"
          :aria-label="`JSON para nuevo registro de ${selectedLabel}`"
          spellcheck="false"
        />
        <button
          type="button"
          class="mt-3 rounded-lg bg-agron-green px-4 py-2 text-xs font-semibold text-white hover:bg-agron-green-dark disabled:opacity-50"
          :disabled="saving || loading"
          @click="createRecord"
        >
          {{ saving ? 'Guardando…' : 'Crear registro' }}
        </button>
      </div>
      <p v-else class="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        Esta tabla se muestra en modo lectura para proteger los perfiles de acceso y la bitácora de auditoría.
      </p>

      <div class="flex items-center justify-between text-xs text-gray-500">
        <span>{{ selectedLabel }} · {{ records.length }} registro(s)</span>
        <span>Máximo 100 por consulta</span>
      </div>

      <div v-if="loading" class="py-8 text-center text-sm text-gray-500">Consultando Supabase…</div>
      <div v-else-if="records.length === 0 && !errorMessage" class="rounded-lg bg-gray-50 py-8 text-center text-sm text-gray-500">
        No hay registros para mostrar.
      </div>
      <div v-else class="space-y-3">
        <article
          v-for="(record, index) in records"
          :key="typeof record.id === 'string' ? record.id : `row-${index}`"
          class="rounded-xl border border-gray-200 p-4"
        >
          <template v-if="editingId === record.id">
            <label class="text-xs font-semibold text-gray-700" :for="`edit-record-${index}`">Editar JSON</label>
            <textarea
              :id="`edit-record-${index}`"
              v-model="editingJson"
              rows="8"
              class="mt-2 w-full rounded-lg border border-gray-300 p-3 font-mono text-xs focus:border-agron-green focus:outline-none focus:ring-2 focus:ring-agron-green/20"
              spellcheck="false"
            />
            <div class="mt-3 flex gap-2">
              <button type="button" class="rounded-lg bg-agron-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="saving" @click="saveRecord">
                {{ saving ? 'Guardando…' : 'Guardar cambios' }}
              </button>
              <button type="button" class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600" @click="editingId = null">
                Cancelar
              </button>
            </div>
          </template>
          <template v-else>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <code class="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-gray-700">{{ JSON.stringify(record, null, 2) }}</code>
              <div v-if="!isReadOnly" class="flex shrink-0 gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-agron-green disabled:opacity-50"
                  :disabled="typeof record.id !== 'string'"
                  @click="startEditing(record)"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  :disabled="typeof record.id !== 'string'"
                  @click="deleteRecord(record)"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </template>
        </article>
      </div>
    </div>
  </Card>
</template>
