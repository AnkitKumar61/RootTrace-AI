import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Redis from 'ioredis';
import {Queue,Worker,QueueEvents} from 'bullmq';
import dotenv from 'dotenv';
dotenv.config({quiet:true,path:new URL('../../.env',import.meta.url)});
test('managed Redis runs jobs, retries, stable IDs and graceful close',{skip:!process.env.REDIS_URL,timeout:45000},async()=>{
  const name=`roottrace-check-${randomUUID()}`;
  const connections=[0,1,2].map(()=>new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null,retryStrategy:()=>null}));
  connections.forEach(c=>c.on('error',()=>{}));
  const queue=new Queue(name,{connection:connections[0]});const events=new QueueEvents(name,{connection:connections[1]});
  let attempts=0;
  const worker=new Worker(name,async job=>{attempts++;if(job.data.fail)throw Error('synthetic processing failure');return {processed:true};},{connection:connections[2],concurrency:1});
  try{
    await events.waitUntilReady();await worker.waitUntilReady();
    const job=await queue.add('success',{}, {jobId:'stable-success'});
    assert.deepEqual(await job.waitUntilFinished(events,15000),{processed:true});
    assert.equal((await queue.add('success',{}, {jobId:'stable-success'})).id,job.id);assert.equal(await queue.getCompletedCount(),1);
    const failed=await queue.add('failure',{fail:true},{attempts:3,backoff:{type:'exponential',delay:50}});
    await assert.rejects(failed.waitUntilFinished(events,20000));
    assert.equal((await queue.getJob(failed.id)).attemptsMade,3);assert.equal(attempts,4);
  }finally{
    await worker.close();await events.close();await queue.obliterate({force:true});await queue.close();await Promise.all(connections.map(c=>c.quit()));
  }
});
