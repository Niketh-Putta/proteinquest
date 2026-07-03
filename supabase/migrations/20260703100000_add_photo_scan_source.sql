-- Track AI analysis events separately from logged meals (free scan quota).

alter table public.protein_logs
  drop constraint if exists protein_logs_source_check;

alter table public.protein_logs
  add constraint protein_logs_source_check
  check (source in ('photo', 'manual', 'photo_scan'));
