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

-- La base de datos, no el navegador ni user_metadata, es la fuente de autoridad del rol.
CREATE OR REPLACE FUNCTION public.is_agronia_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'administrador'
      AND active = true
  );
$$;
REVOKE ALL ON FUNCTION public.is_agronia_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_agronia_admin() TO authenticated;

-- Eliminar políticas si ya existen para poder recrearlas sin error
DROP POLICY IF EXISTS "Permitir ver perfiles a todos los autenticados" ON public.profiles;
DROP POLICY IF EXISTS "Permitir actualizar perfiles a admins" ON public.profiles;
DROP POLICY IF EXISTS "Permitir eliminar perfiles a admins" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile and admins all" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

CREATE POLICY "Users can view own profile and admins all" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_agronia_admin()))
  WITH CHECK ((SELECT public.is_agronia_admin()));

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING ((SELECT public.is_agronia_admin()));
GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;

-- 2. Función y Trigger para crear un perfil automáticamente cuando alguien se registra
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, active)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', 'Usuario AgronIA'),
    'cliente',
    'pendiente',
    false
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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
DROP POLICY IF EXISTS "Users can view own logs and admins all" ON public.user_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON public.user_logs;

CREATE POLICY "Users can view own logs and admins all" ON public.user_logs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

-- Permitir insertar logs a cualquier usuario autenticado
CREATE POLICY "Users can insert own logs" ON public.user_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT ON public.user_logs TO authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendiente';
UPDATE public.profiles SET status = 'aprobado' WHERE active = true AND status = 'pendiente';
