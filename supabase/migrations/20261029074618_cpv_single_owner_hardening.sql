-- No team administration in this single-owner product.
revoke execute on function public.cpv_set_member(uuid,uuid,text,boolean) from authenticated;
