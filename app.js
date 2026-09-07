const state={draft:[],db:JSON.parse(localStorage.getItem('moduleScanDb')||'[]')};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const COLUMNS=['Sl. Number','Module Details','Tag','Tower No.','Level','Tower'];
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show-toast');setTimeout(()=>t.classList.remove('show-toast'),3000)}
function parseTag(tag){
  const raw=(tag||'').replace(/[—_]/g,'-').replace(/\s+/g,' ').trim();
  const mA=raw.match(/(?:^|[-\s])A\s*0?(\d{2,3})(?=[-\s]|$)/i);
  const mL=raw.match(/(?:^|[-\s])L\s*0?(\d{1,3})(?=[-\s]|$)/i);
  return {towerNo:mA?'A'+mA[1]:'',level:mL?'L'+mL[1]:''};
}
function normalizeTag(s){
  return (s||'').replace(/[—–_]/g,'-').replace(/\s*-\s*/g,'-').replace(/\bA\s+(\d)/gi,'A$1').replace(/\bL\s+(\d)/gi,'L$1').replace(/\s+/g,' ').trim();
}
function looksLikeTag(s){return /(?:^|[-\s])A\s*\d{2,3}[-\s].*?(?:^|[-\s])L\s*\d{1,3}/i.test(s)||/TC[-\s]*A\d{2,3}[-\s]*L\d{1,3}/i.test(s)}
function parseOcr(text){
  const lines=text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const rows=[];
  for(let i=0;i<lines.length;i++){
    let line=lines[i];
    if(/^(sl\.?\s*number|module\s*details|qty|tag|tower)$/i.test(line))continue;
    let sl=(line.match(/^(\d{1,4})\b/)||[])[1]||'';
    let tagStart=line.search(/(?:TC[-\s]*)?A\s*\d{2,3}[-\s]*L\s*\d{1,3}/i);
    if(tagStart<0){
      // OCR sometimes separates columns into neighbouring lines; skip until a likely tag exists.
      continue;
    }
    let before=line.slice(0,tagStart).replace(/^\d+\s*/,'').trim();
    let rest=line.slice(tagStart).trim();
    let tower='';
    const tail=rest.match(/\s+([A-Z])\s*$/i);
    if(tail){tower=tail[1].toUpperCase();rest=rest.slice(0,tail.index).trim()}
    // remove a quantity accidentally sitting before tag only
    before=before.replace(/\s+\d+\s*$/,'').trim();
    let tag=normalizeTag(rest);
    const parsed=parseTag(tag);
    rows.push({sl:sl||String(rows.length+1),module:before,tag,towerNo:parsed.towerNo,level:parsed.level,tower});
  }
  // Fallback: combine adjacent OCR lines when a tag and module were split
  if(!rows.length){
    for(let i=0;i<lines.length;i++){
      const combined=[lines[i],lines[i+1]||'',lines[i+2]||''].join(' ');
      const m=combined.match(/(\d+)?\s*(.*?)\s*((?:TC[-\s]*)?A\s*\d{2,3}[-\s]*L\s*\d{1,3}.*)/i);
      if(m&&looksLikeTag(m[3])){
        let tag=normalizeTag(m[3]), p=parseTag(tag);
        rows.push({sl:m[1]||String(rows.length+1),module:m[2].trim(),tag,towerNo:p.towerNo,level:p.level,tower:''});
      }
    }
  }
  return rows;
}
function rowHtml(r,i){return `<tr><td><input data-k="sl" data-i="${i}" value="${r.sl||''}"></td><td><input data-k="module" data-i="${i}" value="${r.module||''}"></td><td><input data-k="tag" data-i="${i}" value="${r.tag||''}"></td><td><input data-k="towerNo" data-i="${i}" value="${r.towerNo||''}" readonly></td><td><input data-k="level" data-i="${i}" value="${r.level||''}" readonly></td><td><input data-k="tower" data-i="${i}" value="${r.tower||''}"></td><td><button class="remove" data-remove="${i}">×</button></td></tr>`}
function renderDraft(){
  $('#draftTable tbody').innerHTML=state.draft.map(rowHtml).join('');
  $$('#draftTable input').forEach(inp=>inp.oninput=()=>{
    let r=state.draft[inp.dataset.i];r[inp.dataset.k]=inp.value;
    if(inp.dataset.k==='tag'){let p=parseTag(normalizeTag(inp.value));r.tag=normalizeTag(inp.value);r.towerNo=p.towerNo;r.level=p.level;renderDraft()}
  });
  $$('[data-remove]').forEach(b=>b.onclick=()=>{state.draft.splice(b.dataset.remove,1);renderDraft()});
}
const titles={upload:['Upload & Extract','Upload a module schedule photo and automatically read it using free OCR.'],database:['Module Database','Search, filter and manage all saved module records.'],export:['Export Data','Download your module records for use in Excel.']};
$$('.nav').forEach(b=>b.onclick=()=>{$$('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.page').forEach(x=>x.classList.remove('active-page'));$('#'+b.dataset.page).classList.add('active-page');$('#pageTitle').textContent=titles[b.dataset.page][0];$('#pageSubtitle').textContent=titles[b.dataset.page][1];renderDb()});
$('#photoInput').onchange=e=>{let f=e.target.files[0];if(!f)return;$('#preview').src=URL.createObjectURL(f);$('#previewWrap').classList.remove('hidden');$('#dropzone').classList.add('hidden');$('#ocrStatus').textContent='Photo ready. Tap Extract Data to start free OCR.'};
$('#removePhoto').onclick=()=>{$('#photoInput').value='';$('#previewWrap').classList.add('hidden');$('#dropzone').classList.remove('hidden');$('#ocrStatus').textContent='Upload a photo, then tap Extract Data.'};
$('#extractBtn').onclick=async()=>{
  const file=$('#photoInput').files[0];
  if(!file){toast('Please upload a photo first');return}
  if(typeof Tesseract==='undefined'){toast('OCR library did not load. Check your internet connection.');return}
  const btn=$('#extractBtn');btn.disabled=true;
  $('#progressWrap').classList.remove('hidden');$('#progressBar').style.width='0%';$('#progressText').textContent='Starting free OCR...';$('#ocrStatus').textContent='Reading image. Please keep this page open.';
  try{
    const worker=await Tesseract.createWorker('eng',1,{logger:m=>{
      if(typeof m.progress==='number'){
        const p=Math.round(m.progress*100);$('#progressBar').style.width=p+'%';$('#progressText').textContent=(m.status||'Processing')+' '+p+'%';
      }
    }});
    const ret=await worker.recognize(file,{}, {text:true});
    await worker.terminate();
    const text=ret.data.text||'';
    $('#rawText').textContent=text;
    state.draft=parseOcr(text);
    if(!state.draft.length){
      toast('OCR finished, but rows could not be identified automatically. Check raw OCR text and add rows manually.');
      state.draft=[{sl:'1',module:'',tag:'',towerNo:'',level:'',tower:''}];
    } else toast(`Found ${state.draft.length} row(s). Please review before saving.`);
    renderDraft();$('#reviewCard').classList.remove('hidden');$('#reviewCard').scrollIntoView({behavior:'smooth'});
    $('#ocrStatus').textContent='OCR completed. Review the extracted data below.';
  }catch(err){
    console.error(err);toast('OCR failed. Try a clearer photo or check your internet connection.');$('#ocrStatus').textContent='OCR failed. Try again with a clearer image.';
  }finally{btn.disabled=false;$('#progressWrap').classList.add('hidden')}
};
$('#addRow').onclick=()=>{state.draft.push({sl:String(state.draft.length+1),module:'',tag:'',towerNo:'',level:'',tower:''});renderDraft()};
$('#clearDraft').onclick=()=>{state.draft=[];renderDraft()};
$('#saveBtn').onclick=()=>{
  let added=0,dupe=0;
  state.draft.forEach(r=>{
    if(!r.tag)return;
    r.tag=normalizeTag(r.tag);let p=parseTag(r.tag);r.towerNo=p.towerNo||r.towerNo;r.level=p.level||r.level;
    let exists=state.db.some(x=>x.towerNo===r.towerNo&&x.level===r.level&&x.tag===r.tag&&x.tower===r.tower);
    if(exists)dupe++;else{state.db.push({...r,saved:new Date().toLocaleString()});added++}
  });
  localStorage.setItem('moduleScanDb',JSON.stringify(state.db));
  toast(`Saved ${added} record(s)${dupe?`, skipped ${dupe} duplicate(s)`:''}`);renderDb();
};
function renderDb(){
  let q=$('#searchInput').value?.toLowerCase()||'',a=$('#towerFilter').value?.toLowerCase()||'',l=$('#levelFilter').value?.toLowerCase()||'',t=$('#towerColFilter').value?.toLowerCase()||'';
  let rows=state.db.filter(r=>(!q||(r.tag+r.module).toLowerCase().includes(q))&&(!a||r.towerNo.toLowerCase().includes(a))&&(!l||r.level.toLowerCase().includes(l))&&(!t||r.tower.toLowerCase().includes(t)));
  $('#dbTable tbody').innerHTML=rows.map(r=>`<tr><td>${r.sl}</td><td>${r.module}</td><td>${r.tag}</td><td>${r.towerNo}</td><td>${r.level}</td><td>${r.tower}</td><td>${r.saved}</td><td><button class="remove" data-del="${state.db.indexOf(r)}">×</button></td></tr>`).join('');
  $$('[data-del]').forEach(b=>b.onclick=()=>{state.db.splice(b.dataset.del,1);localStorage.setItem('moduleScanDb',JSON.stringify(state.db));renderDb()});
  $('#totalRecords').textContent=state.db.length;$('#towerCount').textContent=new Set(state.db.map(r=>r.towerNo).filter(Boolean)).size;$('#levelCount').textContent=new Set(state.db.map(r=>r.level).filter(Boolean)).size;
}
['#searchInput','#towerFilter','#levelFilter','#towerColFilter'].forEach(id=>$(id).oninput=renderDb);
$('#clearDb').onclick=()=>{if(confirm('Delete all saved records?')){state.db=[];localStorage.removeItem('moduleScanDb');renderDb();toast('Database cleared')}};
$('#exportBtn').onclick=()=>{
  let cols=['Sl. Number','Module Details','Tag','Tower No.','Level','Tower','Saved'];
  let csv=[cols.join(','),...state.db.map(r=>[r.sl,r.module,r.tag,r.towerNo,r.level,r.tower,r.saved].map(v=>`"${String(v||'').replaceAll('"','""')}"`).join(','))].join('\n');
  let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='module_data.csv';a.click();
};
renderDb();
