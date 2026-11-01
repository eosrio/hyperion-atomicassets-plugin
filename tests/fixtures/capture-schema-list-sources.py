"""Copy exact original Git blobs for finite source controls, never import a reference app."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'tests'/'fixtures'/'schema-list-original-2.7'
out.mkdir(exist_ok=True)
revision='0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e';repo='P:/eosrio/atomicassets-api'
paths={'schemas.ts':'src/api/namespaces/atomicassets/handlers/schemas.ts','routes.ts':'src/api/namespaces/atomicassets/routes/schemas.ts',
 'format.ts':'src/api/namespaces/atomicassets/format.ts','builder.ts':'src/api/builder.ts',
 'validation.ts':'src/api/namespaces/validation.ts','lists.ts':'src/api/namespaces/lists.ts',
 'boundaries.ts':'src/api/namespaces/utils.ts','greylists.ts':'src/api/namespaces/atomicassets/utils.ts',
 'utils.ts':'src/utils/index.ts','server.ts':'src/api/server.ts','api-utils.ts':'src/api/utils.ts','error.ts':'src/api/error.ts',
 'schema-view.sql':'definitions/views/atomicassets_schemas_master.sql','cache.ts':'src/utils/cache.ts','LICENSE':'LICENSE'}
rows={}
for name,path in paths.items():
 raw=subprocess.check_output(['git','-C',repo,'cat-file','blob',revision+':'+path]);oid=subprocess.check_output(['git','-C',repo,'rev-parse',revision+':'+path]).decode().strip()
 assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==oid
 (out/name).write_bytes(raw);rows[name]={'path':path,'gitBlob':oid,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
codec=root/'vendor'/'atomicassets-2.2.0'/'build'/'index.cjs';codecRaw=codec.read_bytes()
manifest={'baseline':revision,'sources':rows,'codec':{'path':'vendor/atomicassets-2.2.0/build/index.cjs','bytes':len(codecRaw),
 'sha256':hashlib.sha256(codecRaw).hexdigest(),'function':'mergeSchemaFormatTypes'},
 'scope':'Exact source VM functions; scripted SQL/Redis/moize collaborators, not PostgreSQL, a host, or cache qualification'}
(out/'.gitattributes').write_bytes(b'* -text -whitespace\n');(out/'manifest.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode())
print(json.dumps({'files':len(rows),'bytes':sum(row['bytes']for row in rows.values()),'codec':manifest['codec']}))
