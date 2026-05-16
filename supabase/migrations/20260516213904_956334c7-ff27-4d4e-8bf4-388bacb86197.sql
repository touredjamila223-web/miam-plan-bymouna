
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_name TEXT,
  household_size INTEGER DEFAULT 4,
  onboarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Appliances
CREATE TABLE public.appliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appliance TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, appliance)
);

-- Dietary preferences
CREATE TABLE public.dietary_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restriction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, restriction)
);

-- Recipes
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  photo_url TEXT,
  cuisine_style TEXT,
  difficulty TEXT,
  prep_time INTEGER,
  servings INTEGER DEFAULT 4,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  appliance TEXT,
  source TEXT DEFAULT 'user',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recipes_owner ON public.recipes(owner_id);
CREATE INDEX idx_recipes_source ON public.recipes(source);

-- Favorites
CREATE TABLE public.favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

-- Collections
CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.collection_recipes (
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (collection_id, recipe_id)
);

-- Cooked history
CREATE TABLE public.cooked_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  cooked_at TIMESTAMPTZ DEFAULT now(),
  taste_rating INTEGER,
  ease_rating INTEGER,
  comment TEXT,
  family_loved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_cooked_user ON public.cooked_history(user_id);

-- Meal plan
CREATE TABLE public.meal_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot TEXT NOT NULL,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  servings INTEGER DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date, slot)
);

-- Fridge items
CREATE TABLE public.fridge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Shopping list
CREATE TABLE public.shopping_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  category TEXT,
  qty TEXT,
  checked BOOLEAN DEFAULT FALSE,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL DEFAULT 'default',
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_user_thread ON public.chat_messages(user_id, thread_id, created_at);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dietary_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooked_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fridge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Generic user_id policies
CREATE POLICY "owner all" ON public.appliances FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.dietary_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.favorites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.collections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.cooked_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.meal_plan FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.fridge_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.shopping_list FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON public.chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Recipes: seed visible to all authed, user can see own + seed, can CRUD own
CREATE POLICY "View own or seed recipes" ON public.recipes FOR SELECT USING (
  source = 'seed' OR auth.uid() = owner_id
);
CREATE POLICY "Insert own recipes" ON public.recipes FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Update own recipes" ON public.recipes FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Delete own recipes" ON public.recipes FOR DELETE USING (auth.uid() = owner_id);

-- collection_recipes: must own the collection
CREATE POLICY "owner all via collection" ON public.collection_recipes FOR ALL USING (
  EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, family_name, household_size)
  VALUES (NEW.id, NULL, 4)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
