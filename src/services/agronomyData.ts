import { supabase } from './supabase'
import { parseCropAnalysis, type CropAnalysisResult } from './cropAnalysisValidation'

export interface ParcelOwner {
  id: string
  email: string
  full_name: string | null
}

export interface ParcelRecord {
  id: string
  owner_id: string
  name: string
  hectares: number
  crop: string
  municipality: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  profiles: ParcelOwner | null
}

export interface ParcelInput {
  owner_id: string
  name: string
  hectares: number
  crop: string
  municipality: string
  status: 'pending' | 'approved'
}

export interface CropAnalysisHistoryRecord extends CropAnalysisResult {
  id: string
  crop: string
  source_image_name: string
  created_at: string
}

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Añade VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY a .env.local.')
  }
  return supabase
}

export const listParcels = async (): Promise<ParcelRecord[]> => {
  const client = requireSupabase()
  const { data, error } = await client
    .from('parcels')
    .select('id,owner_id,name,hectares,crop,municipality,status,created_at,profiles!parcels_owner_id_fkey(id,email,full_name)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar las parcelas: ${error.message}`)
  return (data ?? []) as unknown as ParcelRecord[]
}

export const listParcelOwners = async (): Promise<ParcelOwner[]> => {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('id,email,full_name')
    .eq('role', 'cliente')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`)
  return (data ?? []) as ParcelOwner[]
}

export const createParcel = async (parcel: ParcelInput): Promise<ParcelRecord> => {
  const client = requireSupabase()
  const { data, error } = await client
    .from('parcels')
    .insert(parcel)
    .select('id,owner_id,name,hectares,crop,municipality,status,created_at,profiles!parcels_owner_id_fkey(id,email,full_name)')
    .single()
  if (error) throw new Error(`No se pudo guardar la parcela: ${error.message}`)
  return data as unknown as ParcelRecord
}

export const updateParcelStatus = async (
  id: string,
  status: ParcelRecord['status'],
): Promise<void> => {
  const { data, error } = await requireSupabase()
    .from('parcels')
    .update({ status })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`No se pudo actualizar el estado de la parcela: ${error.message}`)
  if (!data) throw new Error('La parcela no existe o no tienes permiso para modificarla.')
}

export const deleteParcel = async (id: string): Promise<void> => {
  const { data, error } = await requireSupabase()
    .from('parcels')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`No se pudo eliminar la parcela: ${error.message}`)
  if (!data) throw new Error('La parcela no existe o no tienes permiso para eliminarla.')
}

export const listCropAnalysisHistory = async (): Promise<CropAnalysisHistoryRecord[]> => {
  const { data, error } = await requireSupabase()
    .from('crop_analysis_results')
    .select('id,crop,source_image_name,summary,image_quality,detections,created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(`No se pudo cargar el historial de análisis: ${error.message}`)
  return (data ?? []).map(row => ({
    id: row.id,
    crop: row.crop,
    source_image_name: row.source_image_name,
    created_at: row.created_at,
    ...parseCropAnalysis({
      summary: row.summary,
      imageQuality: row.image_quality,
      detections: row.detections,
    }),
  }))
}

export const saveCropAnalysis = async (
  crop: string,
  sourceImageName: string,
  result: CropAnalysisResult,
): Promise<CropAnalysisHistoryRecord> => {
  const { data, error } = await requireSupabase()
    .from('crop_analysis_results')
    .insert({
      crop,
      source_image_name: sourceImageName.slice(0, 180),
      summary: result.summary,
      image_quality: result.imageQuality,
      detections: result.detections,
    })
    .select('id,crop,source_image_name,summary,image_quality,detections,created_at')
    .single()
  if (error) throw new Error(`El análisis se completó, pero no se pudo guardar en el historial: ${error.message}`)
  return {
    id: data.id,
    crop: data.crop,
    source_image_name: data.source_image_name,
    created_at: data.created_at,
    ...parseCropAnalysis({
      summary: data.summary,
      imageQuality: data.image_quality,
      detections: data.detections,
    }),
  }
}
