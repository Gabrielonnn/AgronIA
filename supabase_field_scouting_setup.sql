CREATE TABLE IF NOT EXISTS public.field_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issue_type text NOT NULL CHECK (
    issue_type IN (
      'plaga',
      'enfermedad',
      'estres_hidrico',
      'deficiencia_nutricional',
      'otro',
      'sin_hallazgo'
    )
  ),
  severity text CHECK (severity IN ('baja', 'media', 'alta')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  image_path text NOT NULL,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  location_source text NOT NULL DEFAULT 'none' CHECK (location_source IN ('drone', 'phone', 'none')),
  location_accuracy_m double precision CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
  drone_system_id smallint CHECK (drone_system_id IS NULL OR drone_system_id BETWEEN 0 AND 255),
  drone_altitude_m double precision,
  drone_heading_deg double precision CHECK (drone_heading_deg IS NULL OR drone_heading_deg BETWEEN 0 AND 360),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_observations_coordinates_pair CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT field_observations_severity_matches_issue CHECK (
    (issue_type = 'sin_hallazgo' AND severity IS NULL)
    OR (issue_type <> 'sin_hallazgo' AND severity IS NOT NULL)
  ),
  CONSTRAINT field_observations_image_owned CHECK (
    split_part(image_path, '/', 1) = user_id::text
  )
);

CREATE INDEX IF NOT EXISTS field_observations_user_created_idx
  ON public.field_observations (user_id, created_at DESC);

ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own field observations" ON public.field_observations;
CREATE POLICY "Users can read their own field observations"
  ON public.field_observations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own field observations" ON public.field_observations;
CREATE POLICY "Users can create their own field observations"
  ON public.field_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own field observations" ON public.field_observations;
CREATE POLICY "Users can update their own field observations"
  ON public.field_observations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own field observations" ON public.field_observations;
CREATE POLICY "Users can delete their own field observations"
  ON public.field_observations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.field_observations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.field_observations TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'field-observations',
  'field-observations',
  false,
  5242880,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read their own field observation photos" ON storage.objects;
CREATE POLICY "Users can read their own field observation photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'field-observations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can upload their own field observation photos" ON storage.objects;
CREATE POLICY "Users can upload their own field observation photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'field-observations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own field observation photos" ON storage.objects;
CREATE POLICY "Users can delete their own field observation photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'field-observations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
