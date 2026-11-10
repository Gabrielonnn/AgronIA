CREATE TABLE IF NOT EXISTS public.crops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  scientific_name text,
  optimal_min_humidity numeric,
  optimal_max_humidity numeric,
  optimal_min_temp numeric,
  optimal_max_temp numeric,
  growth_cycle_days int4,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  geojson_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  crop_id uuid REFERENCES public.crops(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.field_crops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  crop_id uuid NOT NULL REFERENCES public.crops(id) ON DELETE RESTRICT,
  planting_date date,
  estimated_harvest_date date,
  actual_harvest_date date,
  yield_tons numeric,
  status text NOT NULL DEFAULT 'planted',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.satellite_imagery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  capture_date timestamptz NOT NULL,
  tile_url text NOT NULL,
  ndvi_avg numeric,
  cloud_coverage numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.map_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  element_type text NOT NULL,
  name text NOT NULL,
  geometry_data jsonb NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  treatment_type text NOT NULL,
  product_name text,
  dosage numeric,
  unit_of_measure text,
  application_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  name text NOT NULL,
  device_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.field_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_date timestamptz NOT NULL DEFAULT now(),
  soil_humidity numeric,
  temperature numeric,
  sustainability_index numeric,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.fields(id) ON DELETE SET NULL,
  scenario_title text NOT NULL,
  input_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'crops', 'fields', 'field_crops', 'satellite_imagery', 'map_elements',
    'treatments', 'devices', 'field_metrics', 'ai_alerts', 'simulations'
  ]
  LOOP
    EXECUTE format('UPDATE public.%I SET id = gen_random_uuid() WHERE id IS NULL', table_name);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', table_name);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', table_name);
    EXECUTE format('UPDATE public.%I SET created_at = now() WHERE created_at IS NULL', table_name);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now()', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = format('public.%I', table_name)::regclass
        AND contype = 'p'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', table_name, table_name || '_pkey');
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.fields ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.map_elements ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.treatments ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.field_metrics ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.simulations ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.fields ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.devices ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fields_user_id_fkey' AND conrelid = 'public.fields'::regclass) THEN
    ALTER TABLE public.fields ADD CONSTRAINT fields_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fields_crop_id_fkey' AND conrelid = 'public.fields'::regclass) THEN
    ALTER TABLE public.fields ADD CONSTRAINT fields_crop_id_fkey
      FOREIGN KEY (crop_id) REFERENCES public.crops(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_crops_field_id_fkey' AND conrelid = 'public.field_crops'::regclass) THEN
    ALTER TABLE public.field_crops ADD CONSTRAINT field_crops_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_crops_crop_id_fkey' AND conrelid = 'public.field_crops'::regclass) THEN
    ALTER TABLE public.field_crops ADD CONSTRAINT field_crops_crop_id_fkey
      FOREIGN KEY (crop_id) REFERENCES public.crops(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'satellite_imagery_field_id_fkey' AND conrelid = 'public.satellite_imagery'::regclass) THEN
    ALTER TABLE public.satellite_imagery ADD CONSTRAINT satellite_imagery_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_elements_field_id_fkey' AND conrelid = 'public.map_elements'::regclass) THEN
    ALTER TABLE public.map_elements ADD CONSTRAINT map_elements_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_elements_user_id_fkey' AND conrelid = 'public.map_elements'::regclass) THEN
    ALTER TABLE public.map_elements ADD CONSTRAINT map_elements_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_field_id_fkey' AND conrelid = 'public.treatments'::regclass) THEN
    ALTER TABLE public.treatments ADD CONSTRAINT treatments_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_user_id_fkey' AND conrelid = 'public.treatments'::regclass) THEN
    ALTER TABLE public.treatments ADD CONSTRAINT treatments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_field_id_fkey' AND conrelid = 'public.devices'::regclass) THEN
    ALTER TABLE public.devices ADD CONSTRAINT devices_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_metrics_field_id_fkey' AND conrelid = 'public.field_metrics'::regclass) THEN
    ALTER TABLE public.field_metrics ADD CONSTRAINT field_metrics_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_metrics_user_id_fkey' AND conrelid = 'public.field_metrics'::regclass) THEN
    ALTER TABLE public.field_metrics ADD CONSTRAINT field_metrics_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_alerts_field_id_fkey' AND conrelid = 'public.ai_alerts'::regclass) THEN
    ALTER TABLE public.ai_alerts ADD CONSTRAINT ai_alerts_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulations_user_id_fkey' AND conrelid = 'public.simulations'::regclass) THEN
    ALTER TABLE public.simulations ADD CONSTRAINT simulations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulations_field_id_fkey' AND conrelid = 'public.simulations'::regclass) THEN
    ALTER TABLE public.simulations ADD CONSTRAINT simulations_field_id_fkey
      FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS fields_user_created_at_idx
  ON public.fields (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS field_crops_field_created_at_idx
  ON public.field_crops (field_id, created_at DESC);
CREATE INDEX IF NOT EXISTS satellite_imagery_field_capture_date_idx
  ON public.satellite_imagery (field_id, capture_date DESC);
CREATE INDEX IF NOT EXISTS map_elements_field_created_at_idx
  ON public.map_elements (field_id, created_at DESC);
CREATE INDEX IF NOT EXISTS treatments_field_application_date_idx
  ON public.treatments (field_id, application_date DESC);
CREATE INDEX IF NOT EXISTS devices_field_created_at_idx
  ON public.devices (field_id, created_at DESC);
CREATE INDEX IF NOT EXISTS field_metrics_field_record_date_idx
  ON public.field_metrics (field_id, record_date DESC);
CREATE INDEX IF NOT EXISTS ai_alerts_field_created_at_idx
  ON public.ai_alerts (field_id, created_at DESC);
CREATE INDEX IF NOT EXISTS simulations_user_created_at_idx
  ON public.simulations (user_id, created_at DESC);

ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satellite_imagery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crops"
  ON public.crops FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage crops"
  ON public.crops FOR ALL TO authenticated
  USING ((SELECT public.is_agronia_admin()))
  WITH CHECK ((SELECT public.is_agronia_admin()));

CREATE POLICY "Users can view own fields and admins all"
  ON public.fields FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));
CREATE POLICY "Users can create own fields and admins any"
  ON public.fields FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));
CREATE POLICY "Users can update own fields and admins any"
  ON public.fields FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));
CREATE POLICY "Users can delete own fields and admins any"
  ON public.fields FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()));

CREATE POLICY "Users can access own field crops"
  ON public.field_crops FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ));

CREATE POLICY "Users can access own satellite imagery"
  ON public.satellite_imagery FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ));

CREATE POLICY "Users can access own map elements"
  ON public.map_elements FOR ALL TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    )
  )
  WITH CHECK (
    (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    )
  );

CREATE POLICY "Users can access own treatments"
  ON public.treatments FOR ALL TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    )
  )
  WITH CHECK (
    (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    )
  );

CREATE POLICY "Users can access own devices"
  ON public.devices FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ));

CREATE POLICY "Users can access own field metrics"
  ON public.field_metrics FOR ALL TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    )
  )
  WITH CHECK (
    (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    )
  );

CREATE POLICY "Users can read and create own field alerts"
  ON public.ai_alerts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  ));

CREATE POLICY "Users can access own simulations"
  ON public.simulations FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
  WITH CHECK (
    (user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
    AND (
      field_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.fields f
        WHERE f.id = field_id AND (f.user_id = (SELECT auth.uid()) OR (SELECT public.is_agronia_admin()))
      )
    )
  );

GRANT SELECT ON public.crops TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.crops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_crops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.satellite_imagery TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_elements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulations TO authenticated;

CREATE OR REPLACE FUNCTION public.save_map_workspace(p_name text, p_geojson jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  saved_field_id uuid;
  map_feature jsonb;
  feature_index integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;
  IF char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'El nombre del mapa debe tener entre 1 y 120 caracteres.';
  END IF;
  IF jsonb_typeof(p_geojson) IS DISTINCT FROM 'object'
    OR p_geojson->>'type' IS DISTINCT FROM 'FeatureCollection'
    OR jsonb_typeof(p_geojson->'features') IS DISTINCT FROM 'array'
    OR COALESCE(jsonb_array_length(p_geojson->'features'), 0) = 0
    OR COALESCE(jsonb_array_length(p_geojson->'features'), 0) > 500 THEN
    RAISE EXCEPTION 'El mapa debe contener entre 1 y 500 elementos GeoJSON.';
  END IF;

  INSERT INTO public.fields (user_id, name, geojson_data)
  VALUES (auth.uid(), btrim(p_name), p_geojson)
  RETURNING id INTO saved_field_id;

  FOR map_feature IN
    SELECT value FROM jsonb_array_elements(p_geojson->'features')
  LOOP
    feature_index := feature_index + 1;
    IF jsonb_typeof(map_feature->'geometry') = 'object' THEN
      INSERT INTO public.map_elements (
        field_id, user_id, element_type, name, geometry_data, properties
      )
      VALUES (
        saved_field_id,
        auth.uid(),
        COALESCE(map_feature->'geometry'->>'type', 'Geometry'),
        COALESCE(NULLIF(btrim(map_feature->'properties'->>'name'), ''), 'Elemento ' || feature_index),
        map_feature->'geometry',
        COALESCE(map_feature->'properties', '{}'::jsonb)
      );
    END IF;
  END LOOP;

  RETURN saved_field_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_map_workspace(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_map_workspace(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_field_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_fields_updated_at ON public.fields;
CREATE TRIGGER set_fields_updated_at
  BEFORE UPDATE ON public.fields
  FOR EACH ROW EXECUTE FUNCTION public.set_field_updated_at();
