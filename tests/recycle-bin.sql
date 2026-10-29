-- Existing fixtures belong to the disposable local contract database only.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select public.cpv_document_action('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','archive');
do $$begin
 if exists(select 1 from public.cpv_search('20000000-0000-4000-8000-000000000001',array['market'])) then raise exception 'FAIL: trash remains searchable';end if;
 begin perform public.cpv_document_action('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','archive');raise exception 'FAIL: foreign delete allowed';exception when raise_exception then if sqlerrm<>'forbidden' then raise;end if;end;
end;$$;
select public.cpv_document_action('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','restore');
do $$begin
 if(select status from public.cpv_documents where id='30000000-0000-4000-8000-000000000001')<>'ready' then raise exception 'FAIL: published status not restored';end if;
 if(select count(*) from public.cpv_search('20000000-0000-4000-8000-000000000001',array['market']))<>1 then raise exception 'FAIL: restored source missing';end if;
end;$$;
reset role;
update public.cpv_documents set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=1 where id='30000000-0000-4000-8000-000000000002';
set role authenticated;
select public.cpv_document_action('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','archive');
select public.cpv_document_action('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','restore');
do $$begin
 if exists(select 1 from public.cpv_documents where id='30000000-0000-4000-8000-000000000002' and (status<>'failed' or lease_token is not null or lease_until is not null)) then raise exception 'FAIL: interrupted job resumed automatically';end if;
end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
 begin perform public.cpv_document_action('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','archive');raise exception 'FAIL: inactive reader delete';exception when raise_exception then if sqlerrm<>'forbidden' then raise;end if;end;
end;$$;
reset role;
