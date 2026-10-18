import { NextRequest, NextResponse } from 'next/server';
import { getSafepayConfig, handleSafepayWebhook, verifySafepayWebhook } from '@/server/integrations/safepay';
import { prisma } from '@/server/db';
import { createErrorResponse } from '@/shared/errors';
export async function POST(req:NextRequest){
 try{
  const rawBody=await req.text();const signature=req.headers.get('x-sfpy-signature')||'';
  let parsed:any=null;try{parsed=JSON.parse(rawBody)}catch{return createErrorResponse('INVALID_WEBHOOK','SafePay webhook body was not valid JSON.',400)}
  // Resolve the workspace from the tracker so per-workspace webhook secrets are used; fall back to env secret.
  const tracker=String(parsed?.data?.tracker||parsed?.tracker||'');
  const known=tracker?await prisma.payment.findFirst({where:{providerCheckoutSessionId:tracker},select:{workspaceId:true}}):null;
  const config=await getSafepayConfig(known?.workspaceId);if(!config.webhookSecret)return createErrorResponse('SAFEPAY_WEBHOOK_NOT_CONFIGURED','SafePay webhook signing secret is not configured.',503);
  if(!verifySafepayWebhook(rawBody,signature,config.webhookSecret))return createErrorResponse('INVALID_SIGNATURE','SafePay webhook signature verification failed.',400);
  const event=parsed;
  const result=await handleSafepayWebhook(event);return NextResponse.json({received:true,duplicate:result.duplicate,status:result.payment?.status});
 }catch(err){console.error('SafePay webhook error:',err);return createErrorResponse('SAFEPAY_WEBHOOK_ERROR',err instanceof Error?err.message:'SafePay webhook failed.',500)}
}
