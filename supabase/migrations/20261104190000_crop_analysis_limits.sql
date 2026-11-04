CREATE TABLE IF NOT EXISTS public.crop_analysis_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count BETWEEN 0 AND 20),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.crop_analysis_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_crop_analysis_request()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reserved boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.crop_analysis_usage (user_id, usage_date, request_count)
  VALUES (auth.uid(), (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET request_count = public.crop_analysis_usage.request_count + 1
  WHERE public.crop_analysis_usage.request_count < 20
  RETURNING true INTO reserved;

  RETURN COALESCE(reserved, false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_crop_analysis_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_crop_analysis_request() TO authenticated;
