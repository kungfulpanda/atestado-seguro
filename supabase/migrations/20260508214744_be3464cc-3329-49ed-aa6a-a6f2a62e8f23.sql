
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  crm TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Atestados table
CREATE TABLE public.atestados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_paciente TEXT NOT NULL,
  data_atendimento DATE NOT NULL,
  dias INTEGER NOT NULL CHECK (dias > 0),
  observacao TEXT,
  cid TEXT,
  medico_nome TEXT NOT NULL,
  medico_crm TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;

-- Doctor sees own
CREATE POLICY "Medicos view own atestados" ON public.atestados FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "Medicos insert own atestados" ON public.atestados FOR INSERT WITH CHECK (auth.uid() = medico_id);

-- Public validation: anyone (anon or authenticated) can read by id
CREATE POLICY "Public can validate atestados" ON public.atestados FOR SELECT TO anon USING (true);

-- Auto-create profile on signup using metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, crm)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', 'Médico'),
    COALESCE(NEW.raw_user_meta_data->>'crm', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
