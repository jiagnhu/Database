import unittest,sys,io,zipfile,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from parsing import check_office,extract,validate_file
from run import validate_translations
from translation import batches,translate_batch
import json
from transport import ProcessingError

class WorkerContracts(unittest.TestCase):
    def test_truncated_batch_splits_and_caches_completed_parts(self):
        pairs=[({'id':str(i),'en':'Example text','zh':''},str(i)) for i in range(4)];calls=[];saved={}
        class Model:
            def call(self,path,body,budget):
                items=json.loads(body['messages'][1]['content']);calls.append([p['id'] for p in items])
                if len(items)>2:return {'choices':[{'finish_reason':'length'}]}
                return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'translations':[{'id':p['id'],'zh':'完整译文'} for p in items]})}}]}
        translate_batch(pairs,Model(),'model',lambda k,v:saved.update({k:v}),lambda:None)
        self.assertEqual(calls,[['0','1','2','3'],['0','1'],['2','3']]);self.assertEqual(len(saved),4)
    def test_translation_has_bounded_retries_and_does_not_retry_transport_errors(self):
        pair=[({'id':'one','en':'text','zh':''},'key')]
        class Model:
            calls=0
            def call(self,*args):self.calls+=1;return {'choices':[{'finish_reason':'length'}]}
        model=Model()
        with self.assertRaisesRegex(ProcessingError,'TRANSLATION_TRUNCATED'):translate_batch(pair,model,'m',lambda *_:None,lambda:None)
        self.assertEqual(model.calls,2)
        class Broken:
            calls=0
            def call(self,*args):self.calls+=1;raise ProcessingError('MODEL_REQUEST_FAILED')
        broken=Broken()
        with self.assertRaisesRegex(ProcessingError,'MODEL_REQUEST_FAILED'):translate_batch(pair,broken,'m',lambda *_:None,lambda:None)
        self.assertEqual(broken.calls,1)
        grouped=list(batches([({'en':'x'*1100},str(i)) for i in range(5)]));self.assertTrue(all(sum(len(p['en']) for p,_ in g)<=2000 for g in grouped))
    def test_direct_upload_signature_and_size_checked_before_parsing(self):
        for data,kind in [(b'<html>bad</html>','pdf'),(b'%PDF-1.7','docx'),(b'PK\x03\x04','exe'),(b'%PDF-'+bytes(20*1024*1024),'pdf')]:
            with self.assertRaises(ProcessingError):validate_file(data,kind)
        validate_file(b'%PDF-1.7\n','pdf')
        validate_file(b'PK\x03\x04zip','docx')
    def test_zip_bomb_and_xml_entity_are_rejected(self):
        for name,data in [('large.xml',b'a'*4000000),('document.xml',b'<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///x">]>')]:
            b=io.BytesIO()
            with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:z.writestr(name,data)
            with self.assertRaises(ProcessingError):check_office(b.getvalue())
    def test_model_cannot_change_pair_ids_or_drop_translation(self):
        with self.assertRaises(ProcessingError):validate_translations({'translations':[{'id':'wrong','zh':'译文'}]},['real'])
        self.assertEqual(validate_translations({'translations':[{'id':'real','zh':'市场价值'}]},['real']),{'real':'市场价值'})
    def test_existing_formats_extract_nonempty_located_text(self):
        base=Path(os.getenv('CPV_SOURCE_DIR',str(Path.home()/'Downloads'/'CPV Property Learning Material'/'CPV Property Learning Material')))
        if not base.exists():self.skipTest('Local source corpus not present')
        for name in ['CPV Training Lesson 1.pptx','Training Session.docx','ANZVGP 112 Valuations for Mortgage and Loan Security Purposes.pdf']:
            pages=extract((base/name).read_bytes(),name.rsplit('.',1)[1])
            self.assertTrue(pages);self.assertTrue(any(p['pairs'] for p in pages));self.assertTrue(all(p['source'] for p in pages))
if __name__=='__main__':unittest.main()
