"""Read immutable Git blobs only; never import or execute the reference application."""
from pathlib import Path
import hashlib
import json
import subprocess
import argparse

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reference',type=Path,required=True,help='Existing Git repository retaining both immutable source commits')
repo=parser.parse_args().reference.resolve()
out=Path(__file__).resolve().parent/'config-original-2.7'
base='0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e'
fixed='febcd2fb6c849d8f075696f158b0d73de4c72c01'
sources=[
 (base,'src/api/namespaces/atomicassets/handlers/config.ts','config-handler.ts'),
 (base,'src/api/namespaces/atomicassets/routes/config.ts','config-route.ts'),
 (base,'src/filler/handlers/atomicassets/processors/config.ts','config-processor.ts'),
 (base,'src/filler/handlers/atomicassets/index.ts','atomicassets-handler.ts'),
 (base,'src/filler/handlers/atomicassets/v2-guard.ts','v2-guard.source.txt'),
 (base,'src/api/error.ts','error.ts'),
 (base,'src/api/server.ts','server.source.txt'),
 (base,'src/api/utils.ts','api-utils.source.txt'),
 (base,'src/api/namespaces/utils.ts','namespace-utils.source.txt'),
 (base,'definitions/tables/atomicassets_tables.sql','tables.source.sql'),
 (base,'LICENSE','LICENSE'),
 (fixed,'src/filler/handlers/atomicassets/processors/config.ts','config-processor-fork-fix.ts'),
 (fixed,'src/filler/handlers/atomicassets/processors/config-tokens.test.ts','upstream-regression.source.txt'),
]
manifest={'baseline':base,'upstreamCorrection':{'commit':fixed,'pullRequest':'https://github.com/atomicassets/atomicassets-api/pull/255',
 'status':'unmerged at reviewed custody; narrowly proven append-only competing-branch token fork correction'},'sources':{}}
for commit,path,name in sources:
 data=subprocess.check_output(['git','show',commit+':'+path],cwd=repo)
 (out/name).write_bytes(data)
 manifest['sources'][name]={'commit':commit,'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
  'gitBlob':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
print(f'Captured {len(sources)} immutable original/corrected source blobs; no application import or execution.')
