-- Source schema. The generated migration is the deployment entry point.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to authenticated,service_role;

create table public.cpv_organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 daily_token_limit integer not null default 200000 check(daily_token_limit between 1000 and 100000000),
 created_at timestamptz not null default now()
);
create table public.cpv_memberships (
 org_id uuid references public.cpv_organizations on delete cascade, user_id uuid references auth.users on delete cascade,
 role text not null check(role in ('reader','editor','admin')), active boolean not null default true,
 email text not null default '', created_at timestamptz not null default now(), primary key(org_id,user_id)
);
create index cpv_members_user on public.cpv_memberships(user_id,org_id) where active;
create function public.cpv_role(p_org uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.cpv_memberships where org_id=p_org and user_id=(select auth.uid()) and active;
$$;
create table public.cpv_documents (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.cpv_organizations,
 title text not null check(length(title) between 1 and 240), filename text not null, file_type text not null check(file_type in ('pdf','docx','pptx')),
 subtitle text not null default '', version integer not null default 1 check(version>0),
 status text not null default 'uploading' check(status in ('uploading','queued','processing','review','ready','failed','archived')),
 sha256 text not null, byte_size integer not null check(byte_size between 1 and 20971520), storage_path text unique,
 content jsonb not null default '{"sections":[]}', source_pages integer not null default 0, pair_count integer not null default 0,
 source_date text, error_code text, created_by uuid not null references auth.users,
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(org_id,id), unique(org_id,sha256)
);
create index cpv_documents_org_status on public.cpv_documents(org_id,status);
create index cpv_documents_queue on public.cpv_documents(status,lease_until) where status in ('queued','processing');
create table public.cpv_chunks (
 id uuid primary key, org_id uuid not null, document_id uuid not null, section_id text not null,
 pair_ids text[] not null, source text not null, text_en text not null, text_zh text not null,
 embedding extensions.vector(1024), embedding_model text,
 search_text text generated always as (lower(text_en||' '||text_zh)) stored,
 foreign key(org_id,document_id) references public.cpv_documents(org_id,id) on delete cascade
);
create index cpv_chunks_doc on public.cpv_chunks(org_id,document_id);
create index cpv_chunks_terms on public.cpv_chunks using gin(search_text extensions.gin_trgm_ops);
create index cpv_chunks_vector on public.cpv_chunks using hnsw(embedding extensions.vector_cosine_ops);
create table public.cpv_conversations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.cpv_organizations,
 user_id uuid not null references auth.users, title text not null check(length(title)<=160),created_at timestamptz not null default now(),unique(org_id,id,user_id)
);
create table public.cpv_messages (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, conversation_id uuid not null,user_id uuid not null,
 request_id uuid not null, role text not null check(role in ('user','assistant')), content text not null check(length(content)<=20000),
 payload jsonb,created_at timestamptz not null default now(),unique(org_id,user_id,request_id,role),
 foreign key(org_id,conversation_id,user_id) references public.cpv_conversations(org_id,id,user_id) on delete cascade
);
create index cpv_conversations_user on public.cpv_conversations(user_id,org_id,created_at desc);
create index cpv_messages_conversation on public.cpv_messages(conversation_id,created_at);
create table public.cpv_audit (
 id bigint generated always as identity primary key, org_id uuid not null references public.cpv_organizations,user_id uuid,
 action text not null,target_id text,detail jsonb not null default '{}',created_at timestamptz not null default now()
);
create index cpv_audit_org on public.cpv_audit(org_id,created_at desc);
create table public.cpv_usage (
 org_id uuid references public.cpv_organizations, day date not null, used_tokens bigint not null default 0,
 reserved_tokens bigint not null default 0, requests integer not null default 0,primary key(org_id,day)
);
create table public.cpv_reservations (
 id uuid primary key,org_id uuid not null references public.cpv_organizations,user_id uuid not null references auth.users,
 day date not null,tokens integer not null,actual integer,status text not null default 'reserved' check(status in ('reserved','settled')),
 operation text not null,created_at timestamptz not null default now()
);
create index cpv_reservations_rate on public.cpv_reservations(org_id,user_id,created_at desc);
create table public.cpv_processing_cache (
 org_id uuid references public.cpv_organizations,cache_key text not null,payload jsonb not null,created_at timestamptz not null default now(),primary key(org_id,cache_key)
);

alter table public.cpv_organizations enable row level security;
alter table public.cpv_memberships enable row level security;
alter table public.cpv_documents enable row level security;
alter table public.cpv_chunks enable row level security;
alter table public.cpv_conversations enable row level security;
alter table public.cpv_messages enable row level security;
alter table public.cpv_audit enable row level security;
alter table public.cpv_usage enable row level security;
alter table public.cpv_reservations enable row level security;
alter table public.cpv_processing_cache enable row level security;

create policy cpv_org_read on public.cpv_organizations for select to authenticated using(public.cpv_role(id) is not null);
create policy cpv_members_read on public.cpv_memberships for select to authenticated using(public.cpv_role(org_id) is not null);
create policy cpv_docs_read on public.cpv_documents for select to authenticated using(public.cpv_role(org_id) in ('editor','admin') or (status='ready' and public.cpv_role(org_id)='reader'));
create policy cpv_chunks_read on public.cpv_chunks for select to authenticated using(public.cpv_role(org_id) is not null and exists(select 1 from public.cpv_documents d where d.id=document_id and d.org_id=cpv_chunks.org_id and (d.status='ready' or public.cpv_role(d.org_id) in ('editor','admin'))));
create policy cpv_conversations_read on public.cpv_conversations for select to authenticated using(user_id=(select auth.uid()) and public.cpv_role(org_id) is not null);
create policy cpv_conversations_insert on public.cpv_conversations for insert to authenticated with check(user_id=(select auth.uid()) and public.cpv_role(org_id) is not null);
create policy cpv_messages_read on public.cpv_messages for select to authenticated using(user_id=(select auth.uid()) and public.cpv_role(org_id) is not null);
-- Messages are persisted through service-only RPC; clients cannot forge assistant history.
create policy cpv_audit_read on public.cpv_audit for select to authenticated using(public.cpv_role(org_id)='admin');
create policy cpv_usage_read on public.cpv_usage for select to authenticated using(public.cpv_role(org_id)='admin');

create function public.cpv_create_document(p_org uuid,p_title text,p_filename text,p_type text,p_hash text,p_size integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare doc uuid:=gen_random_uuid();
begin
 if public.cpv_role(p_org) not in ('editor','admin') or public.cpv_role(p_org) is null then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 if (select count(*) from public.cpv_documents where org_id=p_org and created_at>now()-interval '1 hour')>=30 then raise exception 'upload_rate_limit';end if;
 if length(p_filename)>240 or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_document';end if;
 insert into public.cpv_documents(id,org_id,title,filename,file_type,sha256,byte_size,storage_path,created_by)
 values(doc,p_org,p_title,p_filename,p_type,p_hash,p_size,p_org::text||'/'||doc::text||'/source.'||p_type,auth.uid());
 return doc;
end;$$;
create function public.cpv_document_action(p_org uuid,p_document uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare d public.cpv_documents;
begin
 if coalesce(public.cpv_role(p_org),'') not in ('editor','admin') then raise exception 'forbidden';end if;
 select * into d from public.cpv_documents where org_id=p_org and id=p_document for update;
 if not found then raise exception 'not_found';end if;
 if p_action='queue' and d.status='uploading' then
   if not exists(select 1 from storage.objects where bucket_id='cpv-originals' and name=d.storage_path) then raise exception 'upload_missing';end if;
   update public.cpv_documents set status='queued',updated_at=now() where id=p_document;
 elsif p_action='publish' and d.status='review' and d.pair_count>0 then
   update public.cpv_documents set status='ready',updated_at=now() where id=p_document;
 elsif p_action='archive' and d.status<>'archived' then
   update public.cpv_documents set status='archived',lease_token=null,lease_until=null,updated_at=now() where id=p_document;
 elsif p_action='retry' and d.status='failed' and d.attempts<3 then
   update public.cpv_documents set status='queued',error_code=null,updated_at=now() where id=p_document;
 else raise exception 'invalid_transition';end if;
 insert into public.cpv_audit(org_id,user_id,action,target_id) values(p_org,auth.uid(),'document.'||p_action,p_document::text);
end;$$;
create function public.cpv_set_member(p_org uuid,p_user uuid,p_role text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 if public.cpv_role(p_org) is distinct from 'admin' or p_user=auth.uid() then raise exception 'forbidden';end if;
 update public.cpv_memberships set role=p_role,active=p_active where org_id=p_org and user_id=p_user;
 if not found then raise exception 'not_found';end if;
 insert into public.cpv_audit(org_id,user_id,action,target_id,detail)values(p_org,auth.uid(),'member.update',p_user::text,jsonb_build_object('role',p_role,'active',p_active));
end;$$;

create function public.cpv_search(p_org uuid,p_terms text[],p_vector extensions.vector(1024) default null,p_document uuid default null,p_limit integer default 12,p_model text default 'text-embedding-v4')
returns table(id uuid,document_id uuid,document_title text,filename text,section_id text,pair_ids text[],source text,text_en text,text_zh text,version integer,source_date text,score double precision)
language sql stable security invoker set search_path=public,extensions as $$
 with eligible as not materialized (
   select c.* from public.cpv_chunks c join public.cpv_documents d on d.id=c.document_id and d.org_id=c.org_id
   where c.org_id=p_org and d.status='ready' and (p_document is null or d.id=p_document)
 ), keyword_hits as (
   select c.id,(select count(*) from unnest(p_terms[1:40]) t where length(t)>=2 and strpos(c.search_text,lower(t))>0)::float as hit
   from eligible c
 ), lexical as (
   select id,row_number() over(order by hit desc,id) as rank from keyword_hits where hit>0 order by hit desc,id limit 40
 ), near_vectors as (
   select c.id,c.embedding<=>p_vector as distance from eligible c
   where p_vector is not null and c.embedding is not null and c.embedding_model=p_model
   order by c.embedding<=>p_vector limit 40
 ), semantic as (
   select id,row_number() over(order by distance,id) as rank from near_vectors where distance<0.65
 ), fused as (
   select coalesce(l.id,s.id) as id,coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0) as score
   from lexical l full outer join semantic s on l.id=s.id
 )
 select c.id,c.document_id,d.title,d.filename,c.section_id,c.pair_ids,c.source,c.text_en,c.text_zh,d.version,d.source_date,f.score::float
 from fused f join eligible c on c.id=f.id join public.cpv_documents d on d.id=c.document_id
 order by f.score desc,c.id limit least(greatest(p_limit,1),20);
$$;

-- Service-only metering; callers cannot release or under-report their own allocations.
create function public.cpv_reserve(p_org uuid,p_user uuid,p_request uuid,p_tokens integer,p_operation text)
returns void language plpgsql security definer set search_path='' as $$
declare allowance integer;today date:=(now() at time zone 'Asia/Shanghai')::date;
begin
 if p_tokens<1 or p_tokens>2000000 or p_operation not in ('chat','ingest') then raise exception 'invalid_reservation';end if;
 if not exists(select 1 from public.cpv_memberships where org_id=p_org and user_id=p_user and active) then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 if exists(select 1 from public.cpv_reservations where id=p_request) then raise exception 'duplicate_request';end if;
 if p_operation='chat' and (select count(*) from public.cpv_reservations where org_id=p_org and user_id=p_user and operation='chat' and created_at>now()-interval '1 minute')>=12 then raise exception 'rate_limit';end if;
 select daily_token_limit into allowance from public.cpv_organizations where id=p_org;
 insert into public.cpv_usage(org_id,day) values(p_org,today) on conflict do nothing;
 update public.cpv_usage set reserved_tokens=reserved_tokens+p_tokens,requests=requests+1
 where org_id=p_org and day=today and used_tokens+reserved_tokens+p_tokens<=allowance;
 if not found then raise exception 'token_budget_exceeded';end if;
 insert into public.cpv_reservations(id,org_id,user_id,day,tokens,operation)values(p_request,p_org,p_user,today,p_tokens,p_operation);
end;$$;
create function public.cpv_settle(p_request uuid,p_actual integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.cpv_reservations;
begin
 if p_actual<0 or p_actual>2000000 then raise exception 'invalid_usage';end if;
 select * into r from public.cpv_reservations where id=p_request for update;
 if not found or r.status='settled' then return;end if;
 update public.cpv_usage set reserved_tokens=reserved_tokens-r.tokens,used_tokens=used_tokens+p_actual where org_id=r.org_id and day=r.day;
 update public.cpv_reservations set status='settled',actual=p_actual where id=p_request;
end;$$;
create function public.cpv_save_chat(p_org uuid,p_user uuid,p_conversation uuid,p_request uuid,p_question text,p_answer text,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.cpv_memberships where org_id=p_org and user_id=p_user and active) then raise exception 'forbidden';end if;
 if not exists(select 1 from public.cpv_conversations where id=p_conversation and org_id=p_org and user_id=p_user)then raise exception 'forbidden';end if;
 insert into public.cpv_messages(org_id,user_id,conversation_id,request_id,role,content,payload)values
 (p_org,p_user,p_conversation,p_request,'user',p_question,null),(p_org,p_user,p_conversation,p_request,'assistant',p_answer,p_payload);
 insert into public.cpv_audit(org_id,user_id,action,target_id)values(p_org,p_user,'chat.answer',p_request::text);
end;$$;
create function public.cpv_claim_job() returns setof public.cpv_documents language plpgsql security definer set search_path='' as $$
declare doc uuid;
begin
 update public.cpv_documents set status='failed',error_code='LEASE_EXHAUSTED' where status='processing' and lease_until<now() and attempts>=3;
 select id into doc from public.cpv_documents where (status='queued' or(status='processing' and lease_until<now())) and attempts<3
 order by created_at for update skip locked limit 1;
 if doc is null then return;end if;
 return query update public.cpv_documents set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now() where id=doc returning *;
end;$$;
create function public.cpv_renew_job(p_document uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.cpv_documents set lease_until=now()+interval '5 minutes' where id=p_document and lease_token=p_lease and status='processing' and lease_until>now();return found;
end;$$;
create function public.cpv_finish_job(p_document uuid,p_lease uuid,p_content jsonb,p_chunks jsonb,p_pages integer,p_pairs integer,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare d public.cpv_documents;c jsonb;
begin
 select * into d from public.cpv_documents where id=p_document for update;
 if d.status<>'processing' or d.lease_token is distinct from p_lease or d.lease_until<now() then raise exception 'lease_lost';end if;
 if p_error is not null then
   update public.cpv_documents set status='failed',error_code=left(p_error,100),lease_token=null,lease_until=null,updated_at=now() where id=p_document;
 else
   if jsonb_typeof(p_content->'sections')<>'array' or p_pairs<1 or jsonb_array_length(p_chunks)<1 then raise exception 'empty_document';end if;
   delete from public.cpv_chunks where document_id=d.id;
   for c in select * from jsonb_array_elements(p_chunks) loop
     insert into public.cpv_chunks(id,org_id,document_id,section_id,pair_ids,source,text_en,text_zh,embedding,embedding_model)
     values((c->>'id')::uuid,d.org_id,d.id,c->>'section_id',array(select jsonb_array_elements_text(c->'pair_ids')),c->>'source',c->>'text_en',c->>'text_zh',(c->>'embedding')::extensions.vector,c->>'embedding_model');
   end loop;
   update public.cpv_documents set status='review',content=p_content,source_pages=p_pages,pair_count=p_pairs,error_code=null,lease_token=null,lease_until=null,updated_at=now() where id=d.id;
 end if;
 insert into public.cpv_audit(org_id,user_id,action,target_id,detail) values(d.org_id,d.created_by,'document.processed',d.id::text,jsonb_build_object('success',p_error is null));
end;$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cpv-originals','cpv-originals',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation']) on conflict(id) do nothing;
create policy cpv_storage_read on storage.objects for select to authenticated using(bucket_id='cpv-originals' and exists(select 1 from public.cpv_documents d where d.storage_path=name and public.cpv_role(d.org_id) is not null));
create policy cpv_storage_insert on storage.objects for insert to authenticated with check(bucket_id='cpv-originals' and exists(select 1 from public.cpv_documents d where d.storage_path=name and d.status='uploading' and d.created_by=(select auth.uid()) and public.cpv_role(d.org_id) in ('editor','admin')));

-- Supabase default privileges can otherwise expose new functions/tables.
do $$declare r record;begin
 for r in select tablename from pg_tables where schemaname='public' and tablename like 'cpv\_%' escape '\' loop
   execute format('revoke all on public.%I from anon,authenticated',r.tablename);
   execute format('grant all on public.%I to service_role',r.tablename);
 end loop;
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cpv\_%' escape '\' loop
   execute format('revoke all on function %s from public,anon,authenticated',r.signature);
   execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end;$$;
grant select on public.cpv_organizations,public.cpv_memberships,public.cpv_documents,public.cpv_chunks,public.cpv_conversations,public.cpv_messages,public.cpv_audit,public.cpv_usage to authenticated;
grant insert on public.cpv_conversations to authenticated;
grant usage,select on sequence public.cpv_audit_id_seq to service_role;
grant execute on function public.cpv_role(uuid),public.cpv_create_document(uuid,text,text,text,text,integer),public.cpv_document_action(uuid,uuid,text),public.cpv_search(uuid,text[],extensions.vector,uuid,integer,text) to authenticated;
