// Cloudflare Pages Function: giữ khoá API ở phía máy chủ + giới hạn RPM/TPM/RPD.
const SYS='Bạn là gia sư Xác suất Thống kê cho người học Việt Nam. Chỉ trả lời các chủ đề liên quan đến xác suất, thống kê và toán liên quan. Trả lời tiếng Việt, công thức viết bằng LaTeX trong $...$. Tuân thủ nghiêm các ràng buộc trong yêu cầu (ví dụ: không nêu đáp án khi được yêu cầu chỉ gợi ý).';
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
export async function onRequestPost({request,env}){
  if(!env.GEMINI_API_KEY||!env.RL)return J({error:'Máy chủ chưa cấu hình GEMINI_API_KEY hoặc KV "RL".'},500);
  const n=(k,d)=>+env[k]||d,L={rpm:n('G_RPM',12),tpm:n('G_TPM',200000),rpd:n('G_RPD',900),irpm:n('IP_RPM',4),ird:n('IP_RPD',60)};
  let b;try{b=await request.json()}catch{return J({error:'Dữ liệu không hợp lệ.'},400)}
  const parts=b.parts;
  if(!Array.isArray(parts)||!parts.length||JSON.stringify(parts).length>6e6)return J({error:'Yêu cầu quá lớn hoặc rỗng.'},413);
  const est=Math.ceil(parts.reduce((a,p)=>a+(p.text?p.text.length:0),0)/3)+parts.filter(p=>p.inline_data).length*1500+3000;
  const ip=request.headers.get('cf-connecting-ip')||'x',m=Math.floor(Date.now()/6e4),d=new Date().toISOString().slice(0,10);
  const K={rpm:'m'+m,tpm:'t'+m,rpd:'d'+d,irpm:'i'+ip+m,ird:'j'+ip+d},c={};
  for(const k in K)c[k]=+(await env.RL.get(K[k]))||0;
  if(c.rpm>=L.rpm||c.tpm+est>L.tpm||c.rpd>=L.rpd||c.irpm>=L.irpm||c.ird>=L.ird)
    return J({error:'Hệ thống đang đạt giới hạn lượt dùng. Vui lòng thử lại sau ít phút.'},429);
  const put=(k,v,t)=>env.RL.put(K[k],String(c[k]+v),{expirationTtl:t});
  await Promise.all([put('rpm',1,120),put('tpm',est,120),put('rpd',1,90000),put('irpm',1,120),put('ird',1,90000)]);
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL||'gemini-3.5-flash-lite'}:generateContent`,{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({systemInstruction:{parts:[{text:SYS}]},contents:[{role:'user',parts}],
      generationConfig:{temperature:.3,maxOutputTokens:3500,...(b.json?{responseMimeType:'application/json'}:{})}})});
  if(!r.ok)return J({error:r.status===429?'Dịch vụ AI đang quá tải, thử lại sau.':'Lỗi dịch vụ AI ('+r.status+').'},502);
  const j=await r.json(),t=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
  return t?J({text:t}):J({error:'AI không trả về nội dung.'},502);
}
