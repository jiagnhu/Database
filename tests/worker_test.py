import unittest,sys,io,zipfile,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from parsing import check_office,extract,validate_file
from run import validate_translations
from transport import ProcessingError

class WorkerContracts(unittest.TestCase):
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
