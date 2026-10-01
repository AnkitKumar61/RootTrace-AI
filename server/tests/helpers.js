import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
process.env.NODE_ENV='test';
process.env.JWT_SECRET='test-only-session-signing-value-12345';
process.env.AI_SERVICE_SECRET='test-only-internal-service-value-12345';
export const {createApp}=await import('../src/app.js');
export const origin='http://localhost:5173';
export async function testDatabase() {
  const database=await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  return async()=>{ await mongoose.disconnect(); await database.stop(); };
}
export async function account(app,email='engineer@example.test') {
  const agent=request.agent(app);
  await agent.post('/api/auth/register').send({name:'Test Engineer',email,password:'demo-password-123'});
  await agent.post('/api/auth/login').send({email,password:'demo-password-123'});
  return agent;
}
