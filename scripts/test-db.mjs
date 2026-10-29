import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const container='cpv-qa-postgres';
const purpose=execFileSync('docker',['inspect','--format','{{index .Config.Labels "cpv.purpose"}}',container],{encoding:'utf8'}).trim();
assert.equal(purpose,'temporary-verification','Refusing to use an unrelated database');
function sql(text,database='cpv_contracts'){return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-q'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
sql('drop database if exists cpv_contracts; create database cpv_contracts;','postgres');
sql(`do $$begin create role anon nologin;exception when duplicate_object then null;end;$$;
do $$begin create role authenticated nologin;exception when duplicate_object then null;end;$$;
do $$begin create role service_role nologin bypassrls;exception when duplicate_object then null;end;$$;
create schema auth;create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(id));
alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;
grant select,insert on storage.objects to authenticated;grant all on storage.objects to service_role;`);
try{sql(fs.readFileSync('supabase/schema.sql','utf8'));sql(fs.readFileSync('tests/database.sql','utf8'));}
catch(e){console.error(e.stderr?.toString());process.exit(1);}
// Two overlapping reservations must not both consume a 1000-token allowance.
const reserve=()=>new Promise(resolve=>{const proc=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','cpv_contracts','-v','ON_ERROR_STOP=1','-q']);let err='';proc.stderr.on('data',b=>err+=b);proc.stdout.resume();proc.stdin.end(`set role service_role;select public.cpv_reserve('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',gen_random_uuid(),600,'chat');`);proc.on('close',code=>resolve({code,err}));});
const results=await Promise.all([reserve(),reserve()]);assert.equal(results.filter(r=>r.code===0).length,1);assert.ok(results.some(r=>r.err.includes('token_budget_exceeded')));
console.log('PASS: real PostgreSQL RLS, cross-space search, inactive access, privilege escalation, metering isolation, idempotency and concurrent quota.');
