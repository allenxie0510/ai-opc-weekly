export async function weeklyDb(path, opts={}) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Missing Supabase configuration');
  const res=await fetch(`${url}/rest/v1${path}`,{...opts,signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...opts.headers}});
  const text=await res.text();
  if(!res.ok) throw new Error(`Database ${res.status}: ${text.slice(0,160)}`);
  return text?JSON.parse(text):null;
}
