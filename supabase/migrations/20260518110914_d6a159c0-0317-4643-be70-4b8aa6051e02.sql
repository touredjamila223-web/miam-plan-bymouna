ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS course_type text NOT NULL DEFAULT 'plat';
CREATE INDEX IF NOT EXISTS recipes_course_type_idx ON public.recipes (course_type);