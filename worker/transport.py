"""Bounded HTTP transport. Never log request bodies, response bodies, or secrets."""
import json, os, urllib.request, urllib.error, uuid
from urllib.parse import urlparse

class ProcessingError(Exception):
    pass

class Backend:
    def __init__(self):
        self.url=os.environ['SUPABASE_URL'].rstrip('/')
        self.key=os.environ['SUPABASE_SECRET_KEY']
        if not self.key or urlparse(self.url).scheme!='https':
            raise ProcessingError('BACKEND_CONFIG')
    def request(self,path,body=None,method=None,raw=False,headers=None):
        head={'apikey':self.key,'Authorization':'Bearer '+self.key,**(headers or {})}
        data=None
        if body is not None:
            data=json.dumps(body,ensure_ascii=False).encode();head['Content-Type']='application/json'
        req=urllib.request.Request(self.url+path,data=data,headers=head,method=method or ('POST' if body is not None else 'GET'))
        try:
            with urllib.request.urlopen(req,timeout=60) as response:
                payload=response.read(22*1024*1024)
                if len(payload)>21*1024*1024:raise ProcessingError('RESPONSE_TOO_LARGE')
                return payload if raw else json.loads(payload or 'null')
        except urllib.error.HTTPError as e:
            raise ProcessingError('BACKEND_HTTP_'+str(e.code)) from None
    def rpc(self,name,body):return self.request('/rest/v1/rpc/'+name,body)
    def cache_get(self,org,key):
        result=self.request(f'/rest/v1/cpv_processing_cache?org_id=eq.{org}&cache_key=eq.{key}&select=payload')
        return result[0]['payload'] if result else None
    def cache_put(self,org,key,value):
        self.request('/rest/v1/cpv_processing_cache?on_conflict=org_id,cache_key',{'org_id':org,'cache_key':key,'payload':value},headers={'Prefer':'resolution=merge-duplicates'})

class Bailian:
    def __init__(self,backend,doc):
        self.backend=backend;self.doc=doc
        self.url=os.getenv('BAILIAN_BASE_URL','https://dashscope.aliyuncs.com/compatible-mode/v1').rstrip('/')
        self.key=os.environ['DASHSCOPE_API_KEY']
        u=urlparse(self.url)
        import re
        allowed=u.hostname in ('dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','dashscope-us.aliyuncs.com') or re.fullmatch(r'[a-z0-9-]+\.(cn-beijing|ap-southeast-1|us-east-1|ap-northeast-1)\.maas\.aliyuncs\.com',u.hostname or '')
        if u.scheme!='https' or not allowed or u.username or u.password or u.port or u.query or u.fragment or not self.key:raise ProcessingError('MODEL_CONFIG')
    def call(self,path,body,output=0):
        payload=json.dumps(body,ensure_ascii=False).encode()
        request_id=str(uuid.uuid4());reserved=len(payload)+output+2048
        self.backend.rpc('cpv_reserve',{'p_org':self.doc['org_id'],'p_user':self.doc['created_by'],'p_request':request_id,'p_tokens':reserved,'p_operation':'ingest'})
        req=urllib.request.Request(self.url+'/'+path,data=payload,headers={'Authorization':'Bearer '+self.key,'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=90) as r:
                response=r.read(2000001)
                if len(response)>2000000:raise ProcessingError('MODEL_RESPONSE_TOO_LARGE')
                result=json.loads(response)
        except (urllib.error.URLError,TimeoutError):
            # No automatic retries: billing may already have occurred.
            raise ProcessingError('MODEL_REQUEST_FAILED') from None
        tokens=result.get('usage',{}).get('total_tokens')
        if isinstance(tokens,int) and tokens>=0:
            self.backend.rpc('cpv_settle',{'p_request':request_id,'p_actual':tokens})
        return result
