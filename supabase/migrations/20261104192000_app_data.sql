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

DROP POLICY IF EXISTS "Permitir ver perfiles a todos los autenticados" ON public.profiles;
DROP POLICY IF EXISTS "Permitir actualizar perfiles a admins" ON public.profiles;
DROP POLICY IF EXISTS "Permitir eliminar perfiles a admins" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile and admins all" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

CREATE POLICY "Users can view own profile and admins all"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT public.is_agronia_admin()))
  WITH CHECK ((SELECT public.is_agronia_admin()));

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING ((SELECT public.is_agronia_admin()));

GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Ver logs" ON public.user_logs;
DROP POLICY IF EXISTS "Insertar logs" ON public.user_logs;
DROP POLICY IF EXISTS "Users can view own logs and admins all" ON public.user_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON public.user_logs;

CREATE POLICY "Users can view own logs and admins all"
  ON public.user_logs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

CREATE POLICY "Users can insert own logs"
  ON public.user_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT ON public.user_logs TO authenticated;

CREATE TABLE IF NOT EXISTS public.parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  hectares numeric(12, 2) NOT NULL CHECK (hectares > 0 AND hectares <= 1000000),
  crop text NOT NULL CHECK (char_length(btrim(crop)) BETWEEN 1 AND 80),
  municipality text NOT NULL CHECK (char_length(btrim(municipality)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS parcels_owner_created_at_idx
  ON public.parcels (owner_id, created_at DESC);

ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own parcels and admins all" ON public.parcels;
DROP POLICY IF EXISTS "Users can request own parcels" ON public.parcels;
DROP POLICY IF EXISTS "Admins can insert parcels" ON public.parcels;
DROP POLICY IF EXISTS "Admins can update parcels" ON public.parcels;
DROP POLICY IF EXISTS "Owners can remove pending parcels and admins any" ON public.parcels;

CREATE POLICY "Users can view own parcels and admins all"
  ON public.parcels FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

CREATE POLICY "Users can request own parcels"
  ON public.parcels FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND status = 'pending'
  );

CREATE POLICY "Admins can insert parcels"
  ON public.parcels FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_agronia_admin()));

CREATE POLICY "Admins can update parcels"
  ON public.parcels FOR UPDATE TO authenticated
  USING ((SELECT public.is_agronia_admin()))
  WITH CHECK ((SELECT public.is_agronia_admin()));

CREATE POLICY "Owners can remove pending parcels and admins any"
  ON public.parcels FOR DELETE TO authenticated
  USING (
    (owner_id = (SELECT auth.uid()) AND status = 'pending')
    OR (SELECT public.is_agronia_admin())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parcels TO authenticated;

CREATE TABLE IF NOT EXISTS public.crop_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  crop text NOT NULL CHECK (char_length(btrim(crop)) BETWEEN 1 AND 80),
  source_image_name text NOT NULL CHECK (char_length(source_image_name) BETWEEN 1 AND 180),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 1000),
  image_quality text NOT NULL CHECK (image_quality IN ('buena', 'limitada', 'insuficiente')),
  detections jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(detections) = 'array' AND jsonb_array_length(detections) <= 20),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS crop_analysis_results_user_created_at_idx
  ON public.crop_analysis_results (user_id, created_at DESC);

ALTER TABLE public.crop_analysis_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own analyses and admins all" ON public.crop_analysis_results;
DROP POLICY IF EXISTS "Users can save own analyses" ON public.crop_analysis_results;
DROP POLICY IF EXISTS "Users can delete own analyses and admins any" ON public.crop_analysis_results;

CREATE POLICY "Users can view own analyses and admins all"
  ON public.crop_analysis_results FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

CREATE POLICY "Users can save own analyses"
  ON public.crop_analysis_results FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own analyses and admins any"
  ON public.crop_analysis_results FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

GRANT SELECT, INSERT, DELETE ON public.crop_analysis_results TO authenticated;
