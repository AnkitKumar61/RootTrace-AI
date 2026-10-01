import {Router} from 'express';
import multer from 'multer';
import path from 'node:path';
import {z} from 'zod';
import {rateLimit} from 'express-rate-limit';
import {authenticate} from '../middleware/auth.js';
import {projectAccess} from '../middleware/ownership.js';
import {Source,publicSource} from '../models/Source.js';
import {storage} from '../services/storage.js';
import {validateFile} from '../validators/upload.js';
import {env} from '../config/env.js';
import {enqueue} from '../queues/workQueue.js';
import {AppError,asyncRoute} from '../utils/errors.js';
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:env.MAX_FILE_SIZE_MB*1024*1024,files:1,fields:2,parts:3}});
const limiter=rateLimit({windowMs:15*60*1000,limit:env.NODE_ENV==='test'?1000:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMITED',message:'Upload limit reached. Please retry later.'}}});
const paging=z.object({start:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(500).default(200)});
export function sourceRoutes(services={}){
  const router=Router({mergeParams:true});router.use(authenticate,projectAccess());
  const store=services.storage||storage;
  async function queueSource(source){
    const id=`ingest-${source._id}`;await Source.updateOne({_id:source._id},{$set:{status:'QUEUED',processingProgress:0,processingStage:'Waiting for worker',processingError:'',bullmqJobId:id}});
    try{await (services.enqueue||enqueue)('ingest',id,{sourceId:String(source._id),projectId:String(source.projectId),userId:String(source.userId),filePath:source.filePath});}
    catch{await Source.updateOne({_id:source._id,status:'QUEUED'},{$set:{status:'FAILED',processingError:'The processing queue is unavailable. Retry this source.'}});throw new AppError(503,'QUEUE_UNAVAILABLE','The source was saved, but could not be queued. Retry from the sources list.');}
  }
  router.get('/',asyncRoute(async(req,res)=>res.json({sources:await Source.find({projectId:req.project._id}).sort({createdAt:-1})})));
  router.post('/',projectAccess(true),limiter,upload.single('file'),asyncRoute(async(req,res)=>{
    validateFile(req.file);const sourceType=z.enum(['log','document']).parse(req.body.sourceType);
    const saved=await store.save(req.file);let source;
    try{source=await Source.create({...saved,projectId:req.project._id,userId:req.user._id,originalFileName:path.basename(req.file.originalname.replaceAll('\\','/')),sourceType,mimeType:req.file.mimetype,fileSize:req.file.size});}catch(error){await store.remove(saved.storedFileName);throw error;}
    await queueSource(source);res.status(202).json({source:publicSource(await Source.findById(source._id))});
  }));
  router.get('/:sourceId',asyncRoute(async(req,res)=>{const source=await Source.findOne({_id:req.params.sourceId,projectId:req.project._id});if(!source)throw new AppError(404,'NOT_FOUND','Source not found.');res.json({source});}));
  router.get('/:sourceId/lines',asyncRoute(async(req,res)=>{
    const source=await Source.findOne({_id:req.params.sourceId,projectId:req.project._id}).select('+storedFileName');if(!source)throw new AppError(404,'NOT_FOUND','Source not found.');
    const {start,limit}=paging.parse(req.query);const lines=(await store.read(source.storedFileName)).split(/\r?\n/);
    res.json({fileName:source.originalFileName,start,totalLines:lines.length,lines:lines.slice(start-1,start-1+limit).map((text,index)=>({number:start+index,text}))});
  }));
  router.post('/:sourceId/retry',projectAccess(true),limiter,asyncRoute(async(req,res)=>{
    const source=await Source.findOne({_id:req.params.sourceId,projectId:req.project._id}).select('+filePath');if(!source)throw new AppError(404,'NOT_FOUND','Source not found.');if(source.status!=='FAILED')throw new AppError(409,'SOURCE_BUSY','Only failed sources can be retried.');await queueSource(source);res.status(202).json({status:'QUEUED'});
  }));
  return router;
}
