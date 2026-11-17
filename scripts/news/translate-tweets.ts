import {createClient} from '@supabase/supabase-js';
import {translateTweet} from '../../lib/reading/translate';
async function main(){
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Missing database configuration');
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data:accounts,error:accountError}=await db.from('twitter_accounts').select('username').eq('enabled',true);
  if(accountError)throw accountError;
  if(!accounts?.length)return;
  const {data,error}=await db.from('tweets').select('tweet_id,content,translated_text').in('author_username',accounts.map(a=>a.username)).order('published_at',{ascending:false}).limit(100);
  if(error)throw error;
  const rows=(data||[]).filter(t=>!t.translated_text&&t.content?.trim());let cursor=0,done=0,failed=0;
  await Promise.all(Array.from({length:2},async()=>{while(cursor<rows.length){const tweet=rows[cursor++];try{
    const translated=await translateTweet(tweet.content);
    const {error}=await db.from('tweets').update({translated_text:translated}).eq('tweet_id',tweet.tweet_id).eq('content',tweet.content);
    if(error)throw error;done++;
  }catch{failed++;console.error(`Translation failed for ${tweet.tweet_id}`);}console.log(`Translations: ${done} saved, ${failed} failed, ${rows.length} pending initially`);}}));
  if(failed)process.exitCode=1;
}
main().catch(()=>{console.error('Translation batch failed');process.exitCode=1;});
