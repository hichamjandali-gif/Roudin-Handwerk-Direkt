-- Roudin Handwerk Direkt: private messaging foundation (not yet deployed)
create table public.roudin_conversations (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id) on delete cascade,
 worker_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 constraint different_participants check (customer_id <> worker_id)
);
create table public.roudin_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.roudin_conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index on public.roudin_conversations(customer_id);
create index on public.roudin_conversations(worker_id);
create index on public.roudin_messages(conversation_id, created_at);
alter table public.roudin_conversations enable row level security;
alter table public.roudin_messages enable row level security;
create policy "participants read conversations" on public.roudin_conversations
 for select to authenticated using (auth.uid() = customer_id or auth.uid() = worker_id);
create policy "customers start conversations" on public.roudin_conversations
 for insert to authenticated with check (auth.uid() = customer_id and customer_id <> worker_id);
create policy "participants read messages" on public.roudin_messages
 for select to authenticated using (exists (
 select 1 from public.roudin_conversations c where c.id = conversation_id
 and (c.customer_id = auth.uid() or c.worker_id = auth.uid())));
create policy "participants send messages" on public.roudin_messages
 for insert to authenticated with check (
 sender_id = auth.uid() and exists (
 select 1 from public.roudin_conversations c where c.id = conversation_id
 and (c.customer_id = auth.uid() or c.worker_id = auth.uid())));
grant select, insert on public.roudin_conversations to authenticated;
grant select, insert on public.roudin_messages to authenticated;
