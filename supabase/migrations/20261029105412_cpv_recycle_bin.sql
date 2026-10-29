alter table public.cpv_documents add column archived_from text check (archived_from in ('uploading','queued','processing','review','ready','failed'));

create or replace function public.cpv_document_action(p_org uuid,p_document uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare d public.cpv_documents; restored text;
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
   update public.cpv_documents set status='archived',archived_from=d.status,lease_token=null,lease_until=null,updated_at=now() where id=p_document;
 elsif p_action='restore' and d.status='archived' then
   restored=case when d.archived_from in ('ready','review','uploading','failed') then d.archived_from when d.archived_from in ('queued','processing') then 'failed' when d.pair_count>0 then 'review' else 'failed' end;
   update public.cpv_documents set status=restored,archived_from=null,lease_token=null,lease_until=null,
     error_code=case when d.archived_from in ('queued','processing') then 'PROCESSING_INTERRUPTED' else d.error_code end,updated_at=now() where id=p_document;
 elsif p_action='retry' and d.status='failed' and d.attempts<3 then
   update public.cpv_documents set status='queued',error_code=null,updated_at=now() where id=p_document;
 else raise exception 'invalid_transition';end if;
 insert into public.cpv_audit(org_id,user_id,action,target_id) values(p_org,auth.uid(),'document.'||p_action,p_document::text);
end;$$;
revoke all on function public.cpv_document_action(uuid,uuid,text) from public,anon;
grant execute on function public.cpv_document_action(uuid,uuid,text) to authenticated;
