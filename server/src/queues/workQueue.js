import { Queue } from 'bullmq';
import { createRedis } from '../config/redis.js';
let queue;
export const queueName='roottrace-work';
export function getQueue(){queue??=new Queue(queueName,{connection:createRedis()});return queue;}
export async function enqueue(name,id,data){
  const q=getQueue();const existing=await q.getJob(id);
  if(existing){if(await existing.getState()==='failed')await existing.retry();return existing;}
  return q.add(name,data,{jobId:id,attempts:name==='cleanup'?8:3,backoff:{type:'exponential',delay:5000},removeOnComplete:{count:100},removeOnFail:{count:200}});
}
export const enqueueCleanup=projectId=>enqueue('cleanup',`cleanup-${projectId}`,{projectId});
export async function closeQueue(){if(queue){const connection=await queue.client;await queue.close();await connection.quit();queue=undefined;}}
