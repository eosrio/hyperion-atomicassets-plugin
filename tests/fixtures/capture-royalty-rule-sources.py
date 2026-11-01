"""Capture exact immutable reference blobs; never import the reference application."""
import hashlib,json,subprocess,sys
from pathlib import Path
repo=Path(sys.argv[1]if len(sys.argv)>1 else 'P:/eosrio/atomicassets-api')
folder=Path(__file__).resolve().parent/'royalty-rule-original-2.7';folder.mkdir(exist_ok=True)
baseline='0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e'
paths={
 'processor.ts':'src/filler/handlers/atomicmarket/processors/royalties.ts','handler.ts':'src/api/namespaces/atomicmarket/handlers/royalties.ts',
 'routes.ts':'src/api/namespaces/atomicmarket/routes/royalties.ts','tables.sql':'definitions/tables/atomicmarket_tables.sql',
 'json.ts':'src/filler/utils.ts','eosio.ts':'src/utils/eosio.ts','server.ts':'src/api/server.ts','namespace-utils.ts':'src/api/namespaces/utils.ts',
 'api-utils.ts':'src/api/utils.ts','error.ts':'src/api/error.ts','validation.ts':'src/api/namespaces/validation.ts','lists.ts':'src/api/namespaces/lists.ts',
 'builder.ts':'src/api/builder.ts','numbers.ts':'src/utils/index.ts','LICENSE':'LICENSE'}
rows={}
for name,path in paths.items():
 raw=subprocess.check_output(['git','-C',str(repo),'cat-file','blob',baseline+':'+path]);oid=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
 assert oid==subprocess.check_output(['git','-C',str(repo),'rev-parse',baseline+':'+path]).decode().strip()
 target=folder/name
 if target.exists():assert target.read_bytes()==raw
 else:target.write_bytes(raw)
 rows[name]={'path':path,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'gitBlob':oid}
(folder/'.gitattributes').write_bytes(b'* -text -whitespace\n')
(folder/'manifest.json').write_bytes((json.dumps({'baseline':baseline,'sources':rows,'scope':'Raw original functions; storage/caches/results modeled, not physical SQL or runtime qualification'},indent=2)+'\n').encode())
print(json.dumps({'baseline':baseline,'sources':len(rows)}))
