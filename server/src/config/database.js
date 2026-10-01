import mongoose from "mongoose";
import { env } from "./env.js";
export async function connectDatabase() {
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
}
