-- Qarzim: Supabase jadvali. Supabase → SQL Editor → New query → shuni qo'yib "Run" bosing.
create table if not exists public.qd_cloud (
  kind       text        not null check (kind in ('idx','data')),
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);

-- Xavfsizlik: jadvalga faqat server (service_role kaliti) kira oladi.
-- Hech qanday policy yozilmaydi, shuning uchun anon kalit bilan hech narsa o'qib/yozib bo'lmaydi.
alter table public.qd_cloud enable row level security;
revoke all on public.qd_cloud from anon, authenticated;
-- Server (service_role) jadvalga kira olishi uchun aniq ruxsat. "Automatically expose new tables" o'chiq bo'lsa ham kerak.
grant all on public.qd_cloud to service_role;

create index if not exists qd_cloud_owner_idx on public.qd_cloud ((value->>'owner')) where kind = 'idx';
