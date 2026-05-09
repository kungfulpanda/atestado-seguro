ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS especialidade text,
  ADD COLUMN IF NOT EXISTS clinica_nome text,
  ADD COLUMN IF NOT EXISTS clinica_endereco text;