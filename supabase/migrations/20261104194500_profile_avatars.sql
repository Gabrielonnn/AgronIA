ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public avatar images are readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar images" ON storage.objects;

CREATE POLICY "Public avatar images are readable"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can update own avatar images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can delete own avatar images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE OR REPLACE FUNCTION public.set_my_avatar_path(p_avatar_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_avatar_path IS NOT NULL
     AND (
       (storage.foldername(p_avatar_path))[1] <> auth.uid()::text
       OR p_avatar_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|png|webp)$'
     ) THEN
    RAISE EXCEPTION 'Invalid avatar path';
  END IF;

  UPDATE public.profiles
  SET avatar_path = p_avatar_path
  WHERE id = auth.uid();

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_avatar_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_avatar_path(text) TO authenticated;
