import mongoose from 'mongoose';
const schema=new mongoose.Schema({
  projectId:{type:mongoose.Schema.Types.ObjectId,ref:'Project',required:true,index:true},userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  originalFileName:{type:String,required:true},storedFileName:{type:String,required:true,select:false},filePath:{type:String,required:true,select:false},
  sourceType:{type:String,enum:['log','document'],required:true},mimeType:String,fileSize:Number,
  status:{type:String,enum:['UPLOADED','QUEUED','PROCESSING','READY','FAILED'],default:'UPLOADED'},
  processingProgress:{type:Number,default:0},processingStage:{type:String,default:'Uploaded'},chunkCount:{type:Number,default:0},
  bullmqJobId:String,processingError:{type:String,default:''},attempts:{type:Number,default:0}
},{timestamps:true});
export const Source=mongoose.model('Source',schema);
export function publicSource(source){const data=source.toObject?source.toObject():{...source};delete data.filePath;delete data.storedFileName;return data;}
