/** Only href attribute values change; email markup and the editable document stay intact. */
export function campaignSlug(value: string) {
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'') || 'edicao'
}
export function attributeNewsletter(html:string,campaign:string){
 return html.replace(/<!--[\s\S]*?-->|<a\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi,tag=>{
  if(tag.startsWith('<!--'))return tag;
  return tag.replace(/(\s+)([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g,(attribute,space,name,equals,value)=>{
   if(name.toLowerCase()!=='href')return attribute;
   const quoted=value[0]==='"'||value[0]==="'";
   const raw=quoted?value.slice(1,-1):value;
   const decoder=new DOMParser().parseFromString('<a href="'+raw.replace(/"/g,'&quot;')+'"></a>','text/html');
   try{
    const url=new URL(decoder.querySelector('a')!.getAttribute('href')!);
    if(url.protocol!=='https:'||!['marioserafim.com.br','www.marioserafim.com.br'].includes(url.hostname)||url.username||url.password||url.port||!/^\/(?:en\/)?blog(?:\/|$)/.test(url.pathname)||/unsubscribe|preferences|descadastro/i.test(url.pathname))return attribute;
    let changed=false;
    for(const [key,v] of Object.entries({utm_source:'mais_um_cafezinho',utm_medium:'email',utm_campaign:campaignSlug(campaign)}))if(!url.searchParams.has(key)){url.searchParams.set(key,v);changed=true;}
    if(!changed)return attribute;
    return space+name+equals+'"'+url.href.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')+'"';
   }catch{return attribute;}
  });
 });
}
