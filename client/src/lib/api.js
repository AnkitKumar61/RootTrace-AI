import axios from 'axios';
export const api=axios.create({baseURL:'/api',withCredentials:true,timeout:130000});
export const errorMessage=error=>error.response?.data?.error?.message || 'Could not connect. Please try again.';
