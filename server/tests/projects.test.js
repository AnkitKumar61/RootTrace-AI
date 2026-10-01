import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,testDatabase,account,origin} from './helpers.js';
let close;const queued=[];const app=createApp({enqueueCleanup:async id=>queued.push(id)});
before(async()=>{close=await testDatabase();});after(async()=>{await close?.();});
test('owner CRUD, cross-user isolation, deleting state and safe retry',async()=>{
  const owner=await account(app,'owner@example.test');const other=await account(app,'other@example.test');
  const created=await owner.post('/api/projects').set('Origin',origin).send({name:'ShopFlow',description:'Checkout services'});
  assert.equal(created.status,201);const id=created.body.project._id;
  for(const method of ['get','patch','delete'])assert.equal((await other[method](`/api/projects/${id}`).set('Origin',origin).send({name:'Changed'})).status,404);
  assert.equal((await other.get('/api/projects')).body.projects.length,0);
  assert.equal((await owner.patch(`/api/projects/${id}`).set('Origin',origin).send({name:'ShopFlow backend'})).status,200);
  assert.equal((await owner.delete(`/api/projects/${id}`).set('Origin',origin)).status,202);
  assert.equal((await owner.get(`/api/projects/${id}`)).body.project.status,'DELETING');
  assert.equal((await owner.patch(`/api/projects/${id}`).set('Origin',origin).send({name:'Changed'})).status,409);
  assert.equal((await owner.delete(`/api/projects/${id}`).set('Origin',origin)).status,202);assert.equal(queued.length,2);
});
