import { supabase } from './supabase'

const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const uploadProfileAvatar = async (
  file: File,
  userId: string,
  previousPath: string | null,
): Promise<{ path: string; url: string; warning?: string }> => {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Añade sus variables a .env.local.')
  }

  const extension = AVATAR_TYPES[file.type]
  if (!extension) {
    throw new Error('Elige una imagen JPG, PNG o WebP.')
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error('La imagen debe pesar 5 MB o menos.')
  }
  if (file.size === 0) {
    throw new Error('El archivo de imagen está vacío.')
  }

  const client = supabase
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })

  if (uploadError) {
    if (uploadError.message.toLowerCase().includes('bucket not found')) {
      throw new Error('No existe el bucket "avatars" en este proyecto Supabase. Aplica la migración de avatares.')
    }
    throw new Error(`No se pudo subir la foto: ${uploadError.message}`)
  }

  const { data: saved, error: saveError } = await client.rpc('set_my_avatar_path', {
    p_avatar_path: path,
  })

  if (saveError || !saved) {
    const { error: cleanupError } = await client.storage.from(AVATAR_BUCKET).remove([path])
    if (cleanupError) console.error('No se pudo limpiar el avatar que no quedó vinculado al perfil:', cleanupError.message)
    if (saveError) throw new Error(`La foto se subió, pero no se pudo guardar en el perfil: ${saveError.message}`)
    throw new Error('La foto se subió, pero no se pudo guardar en el perfil.')
  }

  let warning: string | undefined
  if (previousPath && previousPath !== path) {
    const { error: removeError } = await client.storage.from(AVATAR_BUCKET).remove([previousPath])
    if (removeError) {
      warning = 'La foto se actualizó, pero no se pudo eliminar la imagen anterior.'
      console.error(warning, removeError.message)
    }
  }

  const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl, warning }
}
