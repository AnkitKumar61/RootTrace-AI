import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp,testDatabase,account,origin} from './helpers.js';
import {LocalStorage} from '../src/services/storage.js';
let close,dir,app;const jobs=[];
before(async()=>{close=await testDatabase();dir=await fs.mkdtemp(path.join(os.tmpdir(),'roottrace-test-'));app=createApp({storage:new LocalStorage(dir),enqueue:async(...args)=>jobs.push(args)});});
after(async()=>{await close?.();if(dir)await fs.rm(dir,{recursive:true,force:true});});
test('upload returns queued metadata, reference-only job and original lines',async()=>{
  const owner=await account(app,'source-owner@example.test');const other=await account(app,'source-other@example.test');
  const project=(await owner.post('/api/projects').set('Origin',origin).send({name:'ShopFlow'})).body.project;const base=`/api/projects/${project._id}/sources`;
  const r=await owner.post(base).set('Origin',origin).field('sourceType','log').attach('file',Buffer.from('INFO boot\r\nERROR payment timeout\r\n'),{filename:'payment.log',contentType:'text/plain'});
  assert.equal(r.status,202);assert.equal(r.body.source.status,'QUEUED');assert.equal(r.body.source.filePath,undefined);assert.equal(r.body.source.storedFileName,undefined);
  assert.equal(jobs.length,1);assert.equal(jobs[0][2].text,undefined);assert.equal(jobs[0][2].sourceId,r.body.source._id);
  const lines=await owner.get(`${base}/${r.body.source._id}/lines?start=2&limit=1`);assert.equal(lines.body.lines[0].number,2);assert.equal(lines.body.lines[0].text,'ERROR payment timeout');
  assert.equal((await other.get(base)).status,404);assert.equal((await other.get(`${base}/${r.body.source._id}/lines`)).status,404);
  assert.equal((await owner.post(`${base}/${r.body.source._id}/retry`).set('Origin',origin)).status,409);
  assert.equal((await owner.get(`${base}/${r.body.source._id}/lines?limit=501`)).status,400);
});
test('reject executable extensions, binary and oversized files',async()=>{
  const agent=await account(app,'invalid-upload@example.test');const id=(await agent.post('/api/projects').set('Origin',origin).send({name:'Validation'})).body.project._id;const url=`/api/projects/${id}/sources`;
  for(const [file,buffer] of [['payload.exe',Buffer.from('text')],['binary.log',Buffer.from([0,255,2])]])assert.equal((await agent.post(url).set('Origin',origin).field('sourceType','log').attach('file',buffer,{filename:file,contentType:'text/plain'})).status,400);
  assert.equal((await agent.post(url).set('Origin',origin).field('sourceType','log').attach('file',Buffer.alloc(21*1024*1024,65),{filename:'large.log',contentType:'text/plain'})).status,413);
});
