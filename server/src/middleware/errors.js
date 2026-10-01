import { logger } from '../utils/logger.js';
export function errorHandler(error,req,res,_next) {
  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.status ? error.message : 'The operation could not be completed. Please try again.';
  if (error.name === 'ZodError') { status=400; code='INVALID_INPUT'; message='Please check the supplied fields.'; }
  if (error.name === 'CastError') { status=404; code='NOT_FOUND'; message='The requested resource was not found.'; }
  if (error.code === 11000) { status=409; code='CONFLICT'; message='That record already exists.'; }
  if (error.code === 'LIMIT_FILE_SIZE') { status=413; code='FILE_TOO_LARGE'; message='The file exceeds the upload limit.'; }
  if (error.name === 'MulterError' && status === 500) { status=400; code='INVALID_UPLOAD'; message='The upload is malformed.'; }
  logger.warn({ requestId:req.id, code, status }, 'Request failed');
  res.status(status).json({ error: { code, message, requestId:req.id } });
}
