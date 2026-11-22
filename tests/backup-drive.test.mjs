import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackupJob } from '../worker/backup/run.mjs';
import test from 'node:test';
import { privatePackageDownload, uploadDrivePart } from '../worker/backup/drive.mjs';

test('Drive upload reuses a reserved file ID and verifies downloaded bytes', async () => {
  const bytes = Buffer.from('fixture');
  const spec = { id: 'reserved-id', parentId: 'private-root', artifactId: 'part-1', name: 'Part_000001.zip',
    sha256: createHash('sha256').update(bytes).digest('hex') };
  let stored = false;
  let uploads = 0;
  const request = async (url, options) => {
    if (url.includes('alt=media')) return new Response(bytes);
    if (url === 'https://www.googleapis.com/session') {
      assert.equal(options.method, 'PUT');
      assert.deepEqual(options.body, bytes);
      stored = true;
      return Response.json({ id: spec.id });
    }
    if (options.method === 'POST') {
      uploads++;
      assert.equal(JSON.parse(options.body).id, spec.id);
      return new Response(null, { headers: { Location: 'https://www.googleapis.com/session' } });
    }
    return stored ? Response.json({
      id: spec.id, parents: [spec.parentId], size: String(bytes.length), mimeType: 'application/zip',
      appProperties: { archiveArtifact: spec.artifactId, sha256: spec.sha256 },
    }) : new Response(null, { status: 404 });
  };
  assert.equal((await uploadDrivePart(request, spec, bytes)).reused, false);
  assert.equal((await uploadDrivePart(request, spec, bytes)).reused, true);
  assert.equal(uploads, 1);
  await assert.rejects(uploadDrivePart(async (url, options) =>
    url.includes('alt=media') ? new Response('damaged') : request(url, options), spec, bytes), /checksum/);
});

test('Drive privacy checks include subsequent permission pages and parent folders', async () => {
  const { verifyPrivateDriveFolder } = await import('../worker/backup/drive.mjs');
  let shared = false;
  const request = async url => {
    const path = new URL(url);
    const id = path.pathname.split('/')[4];
    if (!path.pathname.endsWith('/permissions')) return Response.json({
      id, mimeType: 'application/vnd.google-apps.folder', ownedByMe: true, parents: id === 'folder' ? ['root'] : [],
    });
    const owner = { id: 'owner', type: 'user', role: 'owner' };
    if (id === 'root' && shared && !path.searchParams.has('pageToken')) {
      return Response.json({ permissions: [owner], nextPageToken: 'next' });
    }
    return Response.json({ permissions: path.searchParams.has('pageToken') ? [{ type: 'anyone', role: 'reader' }] : [owner] });
  };
  await verifyPrivateDriveFolder(request, 'folder', 'owner');
  shared = true;
  await assert.rejects(verifyPrivateDriveFolder(request, 'folder', 'owner'), /shared/);
});

test('publishes a browsable CSV and reuses its folder and file on rerun', async () => {
  const { publishDriveTree } = await import('../worker/backup/publish.mjs');
  const folderType = 'application/vnd.google-apps.folder';
  const remote = new Map([['root', { id: 'root', mimeType: folderType, ownedByMe: true }]]);
  const reservations = new Map();
  let sessions = 0;
  let staged;
  const registry = {
    async reserve({ logicalId }) {
      if (!reservations.has(logicalId)) reservations.set(logicalId, { id: String(reservations.size + 1) });
      return reservations.get(logicalId);
    },
    async checkpoint() {},
    async verified() {},
  };
  const request = async (url, options) => {
    const path = new URL(url);
    if (path.pathname === '/upload/drive/v3/files') {
      sessions++;
      staged = JSON.parse(options.body);
      return new Response(null, { headers: { Location: 'https://www.googleapis.com/mock-upload' } });
    }
    if (path.pathname === '/mock-upload') {
      remote.set(staged.id, { ...staged, size: String(options.body.length), bytes: options.body });
      return Response.json({ id: staged.id });
    }
    if (options.method === 'POST') {
      const folder = JSON.parse(options.body);
      remote.set(folder.id, { ...folder, ownedByMe: true });
      return Response.json(folder);
    }
    if (path.pathname.endsWith('/permissions')) return Response.json({ permissions: [{ type: 'user', role: 'owner', id: 'owner' }] });
    const file = remote.get(path.pathname.split('/')[4]);
    if (!file) return new Response(null, { status: 404 });
    return path.searchParams.get('alt') === 'media' ? new Response(file.bytes) : Response.json(file);
  };
  const bytes = Buffer.from('Room ID,Room Number\r\nroom,01\r\n');
  const options = { rootId: 'root', ownerId: 'owner', backupId: 'fixture', registry, artifacts: [{
    path: '06_Indexes/Room_Index.csv', bytes, sha256: createHash('sha256').update(bytes).digest('hex'),
  }] };
  const first = await publishDriveTree(request, options);
  assert.deepEqual(await publishDriveTree(request, options), first);
  assert.equal(sessions, 1);
  assert.equal(remote.get(first[0].driveFileId).mimeType, 'text/csv');
  assert.equal(remote.size, 3);

  const directory = await mkdtemp(join(tmpdir(),'mapsilip-destination-test-'));
  try {
    const keys = generateKeyPairSync('ed25519');
    const job = { id:'fixture-job', owner_id:'owner', fence:1, created_at:new Date('2026-11-19T18:00:00Z') };
    let pinnedReceipt;
    let captureReads = 0;
    const result = await runBackupJob({ async query() { return { rows:[job],rowCount:1 }; } }, {
      signingKey:keys.privateKey,verificationKey:keys.publicKey,
      async collect() { return { directory:join(directory,'package'), entries() { captureReads++; return options.artifacts; } }; },
      async verifyRequiredRecoveryArtifacts() { return false; },
      async pinPackageReceipt(_job,_capture,digest) { pinnedReceipt=digest; },
      async drive() { return {request,rootId:'root',ownerId:'owner',registry}; },
      async recordDriveReceipt(active, files) {
        assert.deepEqual(files.map(file=>file.path),[
          '2026-11-20_v1_fixture-job/Part_000001.zip','2026-11-20_v1_fixture-job/Delivery_Receipt.json',
        ]);
        for (const file of files) {
          const name = file.path.split('/').pop();
          assert.deepEqual(remote.get(file.driveFileId).bytes,await readFile(join(directory,'package',name)));
          if (name === 'Delivery_Receipt.json') assert.equal(file.sha256,pinnedReceipt);
        }
        return true;
      },
      async checkLocalCustodyReceipt() { return false; },
    });
    assert.equal(result.state,'completed');
    assert.equal(result.failureCode,'recovery_coverage_unverified');
    assert.equal(captureReads,1);
  } finally { await rm(directory,{recursive:true,force:true}); }

});

test('Drive resumes from the acknowledged range after interruption', async () => {
  const size = 256 * 1024;
  const bytes = Buffer.alloc(size + 7, 42);
  const spec = { id: 'resume', parentId: 'private', artifactId: 'fixture', name: 'Part.zip',
    sha256: createHash('sha256').update(bytes).digest('hex') };
  let stored = false;
  let checkpoint;
  let interrupted = false;
  let sessions = 0;
  const request = async (url, options) => {
    if (url.includes('alt=media')) return new Response(bytes);
    if (url === 'https://www.googleapis.com/resume') {
      const range = options.headers['Content-Range'];
      if (range.startsWith('bytes */')) return new Response(null, { status: 308, headers: { Range: `bytes=0-${size - 1}` } });
      if (range.startsWith('bytes 0-')) return new Response(null, { status: 308, headers: { Range: `bytes=0-${size - 1}` } });
      assert.equal(range, `bytes ${size}-${bytes.length - 1}/${bytes.length}`);
      if (!interrupted) {
        interrupted = true;
        throw new Error('Connection interrupted');
      }
      assert.deepEqual(options.body, bytes.subarray(size));
      stored = true;
      return Response.json({ id: spec.id });
    }
    if (options.method === 'POST') {
      sessions++;
      return new Response(null, { headers: { Location: 'https://www.googleapis.com/resume' } });
    }
    return stored ? Response.json({ id: spec.id, parents: [spec.parentId], size: String(bytes.length),
      mimeType: 'application/zip', appProperties: { archiveArtifact: spec.artifactId, sha256: spec.sha256 } })
      : new Response(null, { status: 404 });
  };
  await assert.rejects(uploadDrivePart(request, spec, bytes, {
    checkpoint(value) { checkpoint = value; },
  }), /interrupted/);
  assert.equal(checkpoint.offset, size);
  await uploadDrivePart(request, spec, bytes, { session: checkpoint.session });
  assert.equal(sessions, 1);
});

test('staging archive root is created once and verified on subsequent bootstrap', async () => {
  const { ensureDriveArchiveRoot } = await import('../worker/backup/drive.mjs');
  let folder;
  let creates = 0;
  const request = async (url, options) => {
    if (url.includes('/permissions?')) return Response.json({ permissions: [{ id: 'owner', type: 'user', role: 'owner' }] });
    if (options.method === 'POST') {
      creates++;
      folder = { ...JSON.parse(options.body), ownedByMe: true, shared: false, parents: ['inaccessible-my-drive'] };
      return Response.json(folder);
    }
    assert.ok(!url.includes('inaccessible-my-drive'));
    return folder ? Response.json(folder) : new Response(null, { status: 404 });
  };
  const input = { id: 'reserved-folder', ownerId: 'owner' };
  assert.equal(await ensureDriveArchiveRoot(request, input), input.id);
  assert.equal(await ensureDriveArchiveRoot(request, input), input.id);
  assert.equal(creates, 1);
  folder.shared = true;
  await assert.rejects(ensureDriveArchiveRoot(request,input), /shared/);
});

test('archive root bootstrap reuses both current and previously registered roots', async () => {
  const { ensureDriveArchiveRoot } = await import('../worker/backup/drive.mjs');
  for (const marker of ['archive-v1', 'staging-v1']) {
    const request = async (url, options) => {
      assert.equal(options.method, undefined);
      if (url.includes('/permissions?')) return Response.json({permissions:[{type:'user',role:'owner',id:'owner'}]});
      return Response.json({id:'existing',mimeType:'application/vnd.google-apps.folder',
        ownedByMe:true,shared:false,appProperties:{mapsilipBackupRoot:marker}});
    };
    assert.equal(await ensureDriveArchiveRoot(request,{id:'existing',ownerId:'owner'}),'existing');
  }
});

test('private download checks the current file, ancestry, account permissions and Google link before redirecting', async () => {
  const artifact = {name:'Part_000001.zip',drive_id:'file',parent_id:'folder',root_id:'root',account_id:'owner',verified_bytes:10,sha256:'a'.repeat(64)};
  const file = {id:'file',name:artifact.name,mimeType:'application/zip',ownedByMe:true,trashed:false,
    capabilities:{canDownload:true},parents:['folder'],size:'10',sha256Checksum:artifact.sha256,
    webContentLink:'https://drive.usercontent.google.com/download?id=file'};
  let permissions = [{type:'user',role:'owner',id:'owner'}];
  function request(url) {
    const id = new URL(url).pathname.split('/')[4];
    if (url.includes('/permissions?')) return Response.json({permissions});
    if (id==='file') return Response.json(file);
    return Response.json({id,parents:id==='folder'?['root']:[],ownedByMe:true,trashed:false,mimeType:'application/vnd.google-apps.folder'});
  }
  assert.equal(await privatePackageDownload(request,artifact),file.webContentLink);
  for (const override of [{root_id:'wrong'},{account_id:'other'},{sha256:'bad'},{verified_bytes:11},{parent_id:'other-folder'}]) {
    await assert.rejects(privatePackageDownload(request,{...artifact,...override}));
  }
  permissions.push({type:'anyone',role:'reader'});
  await assert.rejects(privatePackageDownload(request,artifact));
  permissions=permissions.slice(0,1);
  file.webContentLink='https://example.invalid/download';
  await assert.rejects(privatePackageDownload(request,artifact));
});
