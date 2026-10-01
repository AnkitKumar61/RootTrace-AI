import mongoose from 'mongoose';
const schema=new mongoose.Schema({name:{type:String,required:true},email:{type:String,required:true,unique:true},passwordHash:{type:String,required:true,select:false},sessionVersion:{type:Number,default:0}},{timestamps:true});
export const User=mongoose.model('User',schema);
