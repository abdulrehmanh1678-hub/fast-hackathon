export type LeadStatus = "new" | "assigned" | "acknowledged" | "escalated" | "resolved";
export type Lead = { id:string; name:string; company:string; source:string; owner:string; status:LeadStatus; createdAt:string; ackDeadline:string|null; initials:string };
export type Contact = { id:string; name:string; company:string; email:string; stage:string; owner:string; value:number|null };
export type WhatsAppMessage = { id:string; direction:'INBOUND'|'OUTBOUND'; body:string; status:string; createdAt:string };
export type WhatsAppConversation = { id:string; contactId:string; channel:string; contact:{firstName:string;lastName:string;phone:string|null}; assignedUser:{name:string}|null; messages:WhatsAppMessage[] };
export type DashboardSummary = { activeLeads:number|null; atRisk:number|null; conversion:number|null; revenue:number|null };
export type WorkspaceSession = { user:{id:string;name:string;email:string;role:string;permissions:string[];availabilityStatus:string}; workspace:{id:string;name:string;slug:string} };
export type PaymentRow = { id:string; amount:number; currency:string; status:'PENDING'|'PAID'|'EXPIRED'|'FAILED'|'REFUNDED'; checkoutUrl:string|null; createdAt:string; contact:{firstName:string;lastName:string}|null; opportunity:{title:string}|null };
export type OpportunityOption = { id:string; title:string; value:number|null; contact:{firstName:string;lastName:string}|null };
export class ApiError extends Error { constructor(message:string,public status:number,public fields?:Record<string,string[]>){super(message)} }
export interface ApiClient {
 getDashboard():Promise<DashboardSummary>; listLeads():Promise<Lead[]>; listContacts(query?:string):Promise<Contact[]>;
 acknowledgeLead(id:string):Promise<Lead>; getMe():Promise<WorkspaceSession|null>; login(email:string,password:string):Promise<WorkspaceSession>;
 signup(data:{name:string;email:string;password:string;companyName:string;workspaceSlug:string}):Promise<WorkspaceSession>; logout():Promise<void>;
 createLead(title:string):Promise<Lead>; createContact(data:{firstName:string;lastName:string;email?:string}):Promise<void>; setAvailability(status:string):Promise<void>;
 getConversations():Promise<WhatsAppConversation[]>; sendWhatsAppMessage(contactId:string,body:string):Promise<WhatsAppMessage>;
 listPayments():Promise<PaymentRow[]>; listOpportunities():Promise<OpportunityOption[]>; createPaymentLink(data:{opportunityId:string;amount:number;currency:string;description?:string}):Promise<PaymentRow>;
}
const wait=()=>new Promise(resolve=>setTimeout(resolve,150));
const mockLeads:Lead[]=[
 {id:"LD-2048",name:"Olivia Rhye",company:"Layers Studio",source:"WhatsApp",owner:"You",status:"assigned",createdAt:"2 min ago",ackDeadline:new Date(Date.now()+132000).toISOString(),initials:"OR"},
 {id:"LD-2047",name:"Phoenix Baker",company:"Bento Design",source:"Website form",owner:"Marcus Chen",status:"new",createdAt:"8 min ago",ackDeadline:new Date(Date.now()+402000).toISOString(),initials:"PB"},
 {id:"LD-2046",name:"Lana Steiner",company:"Capsule Corp",source:"WhatsApp",owner:"You",status:"escalated",createdAt:"14 min ago",ackDeadline:new Date(Date.now()-40000).toISOString(),initials:"LS"},
 {id:"LD-2045",name:"Demi Wilkinson",company:"Quotient",source:"Referral",owner:"Ava Patel",status:"acknowledged",createdAt:"31 min ago",ackDeadline:new Date(Date.now()+900000).toISOString(),initials:"DW"},
 {id:"LD-2044",name:"Candice Wu",company:"Sisyphus",source:"Instagram",owner:"Marcus Chen",status:"assigned",createdAt:"42 min ago",ackDeadline:new Date(Date.now()+1200000).toISOString(),initials:"CW"},
];
const mockContacts:Contact[]=[
 {id:"CT-918",name:"Olivia Rhye",company:"Layers Studio",email:"olivia@layers.studio",stage:"Negotiation",owner:"You",value:12400},
 {id:"CT-917",name:"Phoenix Baker",company:"Bento Design",email:"phoenix@bento.design",stage:"Qualified",owner:"Marcus Chen",value:8200},
 {id:"CT-916",name:"Lana Steiner",company:"Capsule Corp",email:"lana@capsule.io",stage:"New lead",owner:"You",value:5600},
 {id:"CT-915",name:"Demi Wilkinson",company:"Quotient",email:"demi@quotient.co",stage:"Won",owner:"Ava Patel",value:18300},
 {id:"CT-914",name:"Candice Wu",company:"Sisyphus",email:"candice@sisyphus.com",stage:"Proposal",owner:"Marcus Chen",value:9800},
];
export const mockApi:ApiClient={
 async getDashboard(){await wait();return {activeLeads:248,atRisk:12,conversion:24.8,revenue:48240}},
 async listLeads(){await wait();return mockLeads.map(x=>({...x}))},async listContacts(){await wait();return mockContacts.map(x=>({...x}))},
 async acknowledgeLead(id){await wait();const x=mockLeads.find(y=>y.id===id);if(!x)throw new ApiError("Lead not found. Refresh and try again.",404);x.status="acknowledged";return {...x}},
 async getMe(){return null},async login(){throw new ApiError("Mock sign in is not configured.",501)},async signup(){throw new ApiError("Mock sign up is not configured.",501)},async logout(){},async createLead(title){const x:Lead={id:`LD-${Date.now()}`,name:title,company:"New contact",source:"Manual",owner:"You",status:"new",createdAt:"Just now",ackDeadline:new Date(Date.now()+300000).toISOString(),initials:title.split(" ").map(y=>y[0]).join("").slice(0,2)};mockLeads.unshift(x);return x},async createContact(){},async setAvailability(){},async getConversations(){return []},async sendWhatsAppMessage(){throw new ApiError("Mock WhatsApp sending is not configured.",501)},
 async listPayments(){return []},async listOpportunities(){return []},async createPaymentLink(){throw new ApiError("Mock payments are not configured.",501)}
};
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...init,credentials:"same-origin",headers:{"Content-Type":"application/json",...init.headers}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new ApiError(body?.error?.message||`Request failed (${response.status}). Try again.`,response.status,body?.error?.fields);
 return body as T;
}
function elapsed(value:string){const mins=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));return mins<1?"Just now":mins<60?`${mins} min ago`:`${Math.floor(mins/60)} hr ago`}
function normalizeLead(row:any):Lead{const contact=row.contact;const name=contact?[contact.firstName,contact.lastName].filter(Boolean).join(" "):row.title;return{id:row.id,name:name||row.title||"New lead",company:contact?.company?.name||"No company",source:row.source||"Manual",owner:row.owner?.name||"Unassigned",status:String(row.status||"NEW").toLowerCase() as LeadStatus,createdAt:elapsed(row.createdAt),ackDeadline:row.ackDeadline||null,initials:(name||row.title||"NL").split(" ").map((x:string)=>x[0]).join("").slice(0,2).toUpperCase()}}
function normalizeContact(row:any):Contact{return{id:row.id,name:[row.firstName,row.lastName].filter(Boolean).join(" "),company:row.company?.name||"—",email:row.email||"No email",stage:"Contact",owner:"—",value:null}}
export const httpApi:ApiClient={
 async getDashboard(){return{activeLeads:null,atRisk:null,conversion:null,revenue:null}},
 async listLeads(){const r=await request<{items:any[]}>('/api/leads?limit=50&offset=0');return(r.items||[]).map(normalizeLead)},
 async listContacts(query=""){const r=await request<{items:any[]}>(`/api/contacts?limit=50&offset=0${query?`&q=${encodeURIComponent(query)}`:""}`);return(r.items||[]).map(normalizeContact)},
 async acknowledgeLead(){throw new ApiError("Acknowledgement is not connected yet. The backend needs a lead acknowledgement route.",501)},
 async getMe(){try{const r=await request<WorkspaceSession>('/api/auth/me');return r}catch(e){if(e instanceof ApiError&&e.status===401)return null;throw e}},
 async login(email,password){return request<WorkspaceSession>('/api/auth/login',{method:"POST",body:JSON.stringify({email,password})})},
 async signup(data){return request<WorkspaceSession>('/api/auth/signup',{method:"POST",body:JSON.stringify(data)})},
 async logout(){await request('/api/auth/logout',{method:"POST"})},
 async createLead(title){const r=await request<{lead:any}>('/api/leads',{method:"POST",body:JSON.stringify({title,source:"manual"})});return normalizeLead(r.lead)},
 async createContact(data){const parts=data.firstName.trim().split(/\s+/);const firstName=parts.shift()||"";const lastName=[...parts,data.lastName].filter(Boolean).join(" ");await request('/api/contacts',{method:"POST",body:JSON.stringify({firstName,lastName,email:data.email||undefined})})},
 async setAvailability(status){const me=await this.getMe();if(!me)throw new ApiError("Sign in to update availability.",401);await request(`/api/users/${me.user.id}`,{method:"PATCH",body:JSON.stringify({availabilityStatus:status.toUpperCase().replaceAll(" ","_")})})}
 ,async getConversations(){const r=await request<{conversations:WhatsAppConversation[]}>('/api/conversations');return(r.conversations||[]).map((conversation)=>({...conversation,messages:[...conversation.messages].reverse()}))}
 ,async listPayments(){const r=await request<{payments:PaymentRow[]}>('/api/payments');return r.payments||[]}
 ,async listOpportunities(){const r=await request<{opportunities:any[]}>('/api/opportunities');return(r.opportunities||[]).map((o)=>({id:o.id,title:o.title,value:o.value??null,contact:o.contact?{firstName:o.contact.firstName,lastName:o.contact.lastName}:null}))}
 ,async createPaymentLink(data){const r=await request<{payment:PaymentRow}>('/api/integrations/safepay/checkout',{method:'POST',body:JSON.stringify(data)});return r.payment}
 ,async sendWhatsAppMessage(contactId,body){const r=await request<{message:WhatsAppMessage}>('/api/integrations/whatsapp/send',{method:'POST',body:JSON.stringify({contactId,body})});return r.message}
};
// Use the contract-backed same-origin API in the running app. mockApi remains available for isolated UI work.
export const api:ApiClient=httpApi;
