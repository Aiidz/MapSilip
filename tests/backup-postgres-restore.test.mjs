// Run with PG_TEST_BINDIR pointing at a local PostgreSQL server's bin directory.
// Creates a new Unix-socket-only cluster. No external DSN is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { samplePdf } from './fixtures/pdf.mjs';
import { captureBackup } from '../worker/backup/capture.mjs';
import { packageLocal, packageFiles, restoreLocal } from '../worker/backup/local.mjs';

test('signed package restores historical foreign keys, original bytes and Auth UUID attribution in disposable PostgreSQL',
  { skip: !process.env.PG_TEST_BINDIR }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mapsilip-restore-drill-'));
    const cluster = join(dir, 'cluster');
    const bin = process.env.PG_TEST_BINDIR;
    const env = {PATH: process.env.PATH, PGHOST: dir, PGPORT: '5432', PGDATABASE: 'postgres', LC_ALL:'C'};
    const run = (tool, args) => execFileSync(['pg_ctl','initdb'].includes(tool) ? join(bin, tool) : tool, args, {env, stdio:'pipe'});
    const owner = '10000000-0000-4000-8000-000000000001';
    const authSchema = 'create schema auth; create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,deleted_at timestamptz)';
    let started = false;
    let client;
    try {
      run('initdb',['-D',cluster,'--no-locale']);
      run('pg_ctl',['-D',cluster,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'start']);
      started = true;
      run('createdb',['restored']);
      run('psql',['-v','ON_ERROR_STOP=1','-c',authSchema + `; insert into auth.users(id) values ('${owner}');
        create schema mapsilip_private; create table public.stays(id int primary key, tenant uuid references auth.users, ended date);
        insert into public.stays values(1,'${owner}','2026-01-01')`]);
      const url = 'postgresql:///postgres?host=' + encodeURIComponent(dir);
      client = new pg.Client({connectionString:url});
      await client.connect();
      const job = '20000000-0000-4000-8000-000000000002';
      const original = samplePdf();
      const sha256 = createHash('sha256').update(original).digest('hex');
      const path = owner+'/'+owner;
      await client.query(`create table rooms(id uuid primary key,room_number text);
        create table tenant_profiles(user_id uuid primary key references auth.users,display_name text);
        create table room_assignments(id uuid primary key,tenant_id uuid references tenant_profiles, room_id uuid references rooms,ended_on date);
        create table attachments(id uuid primary key,bucket_name text,path text,purpose text,mime_type text,byte_size integer,checksum_sha256 text);
        create table invoices(id uuid primary key,tenant_id uuid references tenant_profiles,room_id uuid references rooms);
        create table payments(id uuid primary key,invoice_id uuid references invoices,attachment_id uuid references attachments,created_at timestamptz);
        create table maintenance_requests(id uuid primary key,room_id uuid references rooms,description text);
        create table concerns(id uuid primary key); create table planned_visits(id uuid primary key);
        create table notifications(id uuid primary key); create table operational_audit(id uuid primary key)`);
      await client.query(`insert into rooms values ($1,'01')`,[owner]);
      await client.query(`insert into tenant_profiles values ($1,'Demo former tenant')`,[owner]);
      await client.query(`insert into room_assignments values ($1,$1,$1,'2026-01-01')`,[owner]);
      await client.query(`insert into attachments values ($1,'mapsilip_evidence',$2,'payment','application/pdf',$3,$4)`,[owner,path,original.length,sha256]);
      await client.query('insert into invoices values ($1,$1,$1)',[owner]);
      await client.query("insert into payments values ($1,$1,$1,'2026-01-01T00:00Z')",[owner]);
      await client.query("insert into maintenance_requests values ($1,$1,'Demo repair')",[owner]);
      const capture = await captureBackup({id:job,fence:1},{
        root:dir,database:client,databaseUrl:url,tenantArchiveIds:new Map([[owner,'Demo001']]),
        environment:{}, deployment:{commit:'0'.repeat(40)},
        storage:{
          list:()=>[{path,bytes:original.length,mimeType:'application/pdf',version:'fixture'}],
          download:async()=>original,version:async()=>'fixture',
        },
      });
      const keys = generateKeyPairSync('ed25519');
      const archive = capture.directory;
      await packageLocal(archive,job,capture.entries(),keys.privateKey);
      const destination = join(dir,'received');
      await mkdir(destination);
      for await (const file of packageFiles(archive,keys.publicKey,job)) {
        await writeFile(join(destination,file.path),file.bytes);
      }
      const restored = join(dir,'verified');
      await restoreLocal(destination,restored,keys.publicKey);
      assert.deepEqual(await readFile(join(restored,'05_Financial_Archives','2026','Receipts',
        'Payment_'+owner+'_'+owner+'_Receipt.pdf')),original);
      const technical = join(restored,'01_Technical_Recovery',job);
      assert.deepEqual(await readFile(join(restored,'Restored_Storage','mapsilip_evidence',owner,owner)),original);
      const identities = JSON.parse(await readFile(join(technical,'Auth_Identity_Index.json'),'utf8'));
      assert.equal(identities.accounts[0].id,owner);
      assert.equal(identities.recoveryComplete,false);
      // Stand-in for the externally restored provider identities. Exercise the real FK dependency.
      run('psql',['-d','restored','-c',authSchema]);
      const toc = join(dir,'restore.list');
      const dumpPath = join(dir,'reassembled.dump');
      execFileSync(process.execPath,['scripts/reassemble-backup-dump.mjs',restored,job,dumpPath]);
      const entries = run('pg_restore',['--list',dumpPath]).toString().split('\n');
      await writeFile(toc,entries.filter(line => !/ SCHEMA - public /.test(line)).join('\n'));
      const restore = () => run('pg_restore',['--single-transaction','--exit-on-error','--no-owner','--use-list',toc,'-d','restored',dumpPath]);
      assert.throws(restore,/foreign key constraint/i);
      run('psql',['-d','restored','-c',`insert into auth.users(id) values ('${owner}')`]);
      const verifyAuth = () => execFileSync(process.execPath,['scripts/verify-restored-auth.mjs',destination,join(dir,'trusted.pem')],
        {env:{PATH:process.env.PATH,PGUSER:process.env.USER,BACKUP_RESTORE_DATABASE_URL:'postgresql:///restored?host='+encodeURIComponent(dir)},stdio:'pipe'});
      await writeFile(join(dir,'trusted.pem'),keys.publicKey.export({type:'spki',format:'pem'}));
      assert.match(verifyAuth().toString(),/Verified 1 restored account/);
      run('psql',['-d','restored','-c',"update auth.users set email='mismatch@fixture.invalid'"]);
      assert.throws(verifyAuth);
      run('psql',['-d','restored','-c','update auth.users set email=null']);
      restore();
      assert.equal(run('psql',['-At','-d','restored','-c','select ended from stays join auth.users on tenant=users.id']).toString().trim(),'2026-01-01');
      assert.equal(run('psql',['-At','-d','restored','-c','select count(*) from payments p join invoices i on i.id=p.invoice_id join attachments a on a.id=p.attachment_id']).toString().trim(),'1');
      if (process.env.BACKUP_DEMO_OUTPUT) {
        const output = process.env.BACKUP_DEMO_OUTPUT;
        await mkdir(output,{mode:0o700});
        await cp(destination,join(output,'package'),{recursive:true});
        await writeFile(join(output,'archive-public.pem'),keys.publicKey.export({type:'spki',format:'pem'}));
      }
    } finally {
      await client?.end();
      if (started) run('pg_ctl',['-D',cluster,'-m','fast','stop']);
      await rm(dir,{recursive:true,force:true});
    }
  });
