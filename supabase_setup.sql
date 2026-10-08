-- 1. Crear tabla de Perfiles (Usuarios del sistema)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  full_name text,
  role text default 'cliente',
  active boolean default false,
  status text default 'pendiente',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- (Si la tabla ya existía de antes, nos aseguramos que tenga todas las columnas)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'cliente';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendiente';

-- Habilitar RLS (Seguridad a Nivel de Fila)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas si ya existen para poder recrearlas sin error
DROP POLICY IF EXISTS "Permitir ver perfiles a todos los autenticados" ON public.profiles;
DROP POLICY IF EXISTS "Permitir actualizar perfiles a admins" ON public.profiles;
DROP POLICY IF EXISTS "Permitir eliminar perfiles a admins" ON public.profiles;

-- Crear políticas para la tabla de perfiles
-- Cualquier usuario autenticado puede ver los perfiles (o podrías restringirlo solo a administradores)
CREATE POLICY "Permitir ver perfiles a todos los autenticados" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Solo administradores pueden actualizar y eliminar perfiles
CREATE POLICY "Permitir actualizar perfiles a admins" ON public.profiles
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'administrador'
  );

CREATE POLICY "Permitir eliminar perfiles a admins" ON public.profiles
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'administrador'
  );

-- 2. Función y Trigger para crear un perfil automáticamente cuando alguien se registra
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, active)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', 'Usuario AgronIA'),
    -- Si es jenone0424@gmail.com asignarle admin automáticamente
    CASE WHEN new.email = 'jenone0424@gmail.com' THEN 'administrador' ELSE COALESCE(new.raw_user_meta_data->>'role', 'cliente') END,
    CASE WHEN new.email = 'jenone0424@gmail.com' THEN 'aprobado' ELSE 'pendiente' END,
    CASE WHEN new.email = 'jenone0424@gmail.com' THEN true ELSE false END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger si existe para recrearlo
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Crear el trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Crear tabla de Logs (Sesiones)
CREATE TABLE IF NOT EXISTS public.user_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null, -- 'LOGIN', 'LOGOUT', 'REGISTER'
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS para logs
ALTER TABLE public.user_logs ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas si ya existen para los logs
DROP POLICY IF EXISTS "Ver logs" ON public.user_logs;
DROP POLICY IF EXISTS "Insertar logs" ON public.user_logs;

-- Política: los administradores pueden ver todos los logs, los clientes solo los suyos
CREATE POLICY "Ver logs" ON public.user_logs
  FOR SELECT USING (
    auth.uid() = user_id OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'administrador'
  );

-- Permitir insertar logs a cualquier usuario autenticado
CREATE POLICY "Insertar logs" ON public.user_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Opcional: Insertar perfil para tu usuario existente si ya te habías registrado antes de ejecutar esto
INSERT INTO public.profiles (id, email, full_name, role, status, active)
SELECT id, email, 'Jared (Admin)', 'administrador', 'aprobado', true
FROM auth.users
WHERE email = 'jenone0424@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'administrador', status = 'aprobado', active = true;

-- 5. Migración de datos existentes (Si ya tenías la tabla creada)
-- Ejecutar estas líneas solo si estás actualizando una base de datos que ya estaba funcionando
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendiente';
UPDATE public.profiles SET status = 'aprobado', active = true WHERE role = 'administrador' OR active = true;
