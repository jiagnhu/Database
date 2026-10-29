-- Executed only inside the labeled disposable local PostgreSQL container.
insert into auth.users(id,email)values
 ('10000000-0000-4000-8000-000000000001','owner-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','reader-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','owner-b@example.invalid');
insert into public.cpv_organizations(id,name,daily_token_limit)values
 ('20000000-0000-4000-8000-000000000001','A',1000),('20000000-0000-4000-8000-000000000002','B',1000);
insert into public.cpv_memberships(org_id,user_id,role)values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','reader'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','admin');
insert into public.cpv_documents(id,org_id,title,filename,file_type,sha256,byte_size,status,created_by)values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A ready','a.pdf','pdf','aaa',100,'ready','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','A draft','b.pdf','pdf','bbb',100,'review','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','B private','c.pdf','pdf','ccc',100,'ready','10000000-0000-4000-8000-000000000003');
insert into public.cpv_chunks(id,org_id,document_id,section_id,pair_ids,source,text_en,text_zh)
 select gen_random_uuid(),org_id,id,'s',array['p'],'page 1','Market value','市场价值' from public.cpv_documents;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
 if(select count(*) from public.cpv_documents)<>1 then raise exception 'FAIL: document RLS';end if;
 if(select count(*) from public.cpv_chunks)<>1 then raise exception 'FAIL: chunk RLS';end if;
 if(select count(*) from public.cpv_search('20000000-0000-4000-8000-000000000002',array['market']))<>0 then raise exception 'FAIL: cross-space search';end if;
 if(select count(*) from public.cpv_search('20000000-0000-4000-8000-000000000001',array['市场']))<>1 then raise exception 'FAIL: own-space search';end if;
 begin update public.cpv_memberships set role='admin';raise exception 'FAIL: privilege escalation';exception when insufficient_privilege then null;end;
 begin perform public.cpv_reserve('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',gen_random_uuid(),1,'chat');raise exception 'FAIL: public metering';exception when insufficient_privilege then null;end;
 begin insert into public.cpv_conversations(org_id,user_id,title)values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','forbidden');raise exception 'FAIL: foreign conversation';exception when insufficient_privilege then null;end;
end;$$;
reset role;
update public.cpv_memberships set active=false where user_id='10000000-0000-4000-8000-000000000002';
set role authenticated;
do $$begin if exists(select 1 from public.cpv_documents) or exists(select 1 from public.cpv_chunks) then raise exception 'FAIL: inactive access';end if;end;$$;
reset role;
set role service_role;
select public.cpv_reserve('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',700,'chat');
do $$begin
 begin perform public.cpv_reserve('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',gen_random_uuid(),400,'chat');raise exception 'FAIL: over budget';exception when raise_exception then if sqlerrm<>'token_budget_exceeded' then raise;end if;end;
 begin perform public.cpv_reserve('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,'chat');raise exception 'FAIL: duplicate reservation';exception when raise_exception then if sqlerrm<>'duplicate_request' then raise;end if;end;
end;$$;
select public.cpv_settle('40000000-0000-4000-8000-000000000001',200);
select public.cpv_settle('40000000-0000-4000-8000-000000000001',200);
do $$begin if(select used_tokens from public.cpv_usage where org_id='20000000-0000-4000-8000-000000000001')<>200 then raise exception 'FAIL: idempotent settle';end if;end;$$;
reset role;
