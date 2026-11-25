import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectOriginals, privateStorageReader } from '../worker/backup/collect.mjs';
import { originalArchiveEntries, stageOriginal } from '../worker/backup/capture.mjs';
import { readableEntries } from '../worker/backup/export.mjs';
import { stageBackup, readStagedBackup } from '../worker/backup/staging.mjs';
import { packageLocal, restoreLocal } from '../worker/backup/local.mjs';

const id = '10000000-0000-4000-8000-000000000001';
const path = id + '/' + id;
const block = Buffer.alloc(64 * 1024, 17);
const blocks = 160;
const header = Buffer.from('%PDF-');
const sha = createHash('sha256').update(header);
for (let i=0;i<blocks;i++) sha.update(block);
const checksum = sha.digest('hex');
const size = header.length + blocks * block.length;
const snapshot = {rooms:[],invoices:[],payments:[],maintenance_requests:[],room_assignments:[],attachments:[{
  id,path,purpose:'contract',bucket_name:'mapsilip_evidence',mime_type:'application/pdf',byte_size:size,checksum_sha256:checksum,
}]};

function source(mode) {
  return privateStorageReader({
    list: async prefix => ({data:[{name:id,id:prefix ? id : null}]}),
    info: async () => ({data:{size,contentType:'application/pdf',version:'1'}}),
    download: () => ({asStream: async () => ({data:(async function* () {
      yield header.subarray(0,2);
      yield header.subarray(2);
      for (let i=0;i<blocks;i++) {
        if (mode==='interrupt' && i===80) throw new Error('Interrupted');
        yield mode==='corrupt' && i===80 ? Buffer.alloc(block.length) : block;
      }
    })()})}),
  });
}

for (const mode of ['success','interrupt','corrupt']) test('streamed 10 MiB Storage original: '+mode,async () => {
  const dir = await mkdtemp(join(tmpdir(),'mapsilip-stream-'));
  try {
    const saved = join(dir,id);
    const collect = () => Array.fromAsync(collectOriginals(snapshot,source(mode),undefined,
      (name,chunks) => stageOriginal(dir,name,chunks)));
    if (mode !== 'success') {
      await assert.rejects(collect,mode==='interrupt' ? /Interrupted/ : /checksum mismatch/);
      await assert.rejects(readFile(saved),{code:'ENOENT'});
      return;
    }
    const [object] = await collect();
    const archive = join(dir,'package');
    const originalPath = '04_Tenant_Archives/Unassigned/Historical_Evidence/'+id+'.pdf';
    async function* entries() {
      yield* readableEntries(snapshot,(_id,archivePath) => originalArchiveEntries(saved,object,archivePath,'test'));
      yield {path:'01_Technical_Recovery/test/Storage_Object_Map.json',bytes:Buffer.from(JSON.stringify([object]))};
    }
    const keys = generateKeyPairSync('ed25519');
    const stage = join(dir,'stage');
    const seal = await stageBackup(stage,'test',entries());
    const receipt = await packageLocal(archive,'test',readStagedBackup(stage,'test',seal),keys.privateKey);
    assert.ok(receipt.parts.length > 1);
    await restoreLocal(archive,join(dir,'restore'),keys.publicKey);
    for (const file of [originalPath,'Restored_Storage/mapsilip_evidence/'+path]) {
      assert.equal(createHash('sha256').update(await readFile(join(dir,'restore',file))).digest('hex'),checksum);
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});
