ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS protein text,
  ADD COLUMN IF NOT EXISTS vegetables text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS calories integer;

CREATE INDEX IF NOT EXISTS recipes_protein_idx ON public.recipes(protein);
CREATE INDEX IF NOT EXISTS recipes_cuisine_idx ON public.recipes(cuisine_style);
CREATE INDEX IF NOT EXISTS recipes_prep_time_idx ON public.recipes(prep_time);