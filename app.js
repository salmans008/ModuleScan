import { PaddleOCR } from "@paddleocr/paddleocr-js";

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
function average(values){return values.reduce((a,b)=>a+b,0)/(values.length||1)}
function itemBox(item){
  const pts=item.poly||[];
  const xs=pts.map(p=>Array.isArray(p)?p[0]:p.x);
  const ys=pts.map(p=>Array.isArray(p)?p[1]:p.y);
  return {
    x: Math.min(...xs), x2: Math.max(...xs),
    y: Math.min(...ys), y2: Math.max(...ys),
    cx: average(xs), cy: average(ys)
  };
}

function parsePositionedOcr(items, imageWidth){
  // Use the physical positions of OCR boxes instead of spaces/newlines.
  // Column layout is normalized to the schedule format:
  // Sl. Number | Module Details | Qty (ignored) | Tag | Tower
  const clean=items
    .filter(it=>(it.text||'').trim())
    .map(it=>({...it,text:(it.text||'').replace(/\s+/g,' ').trim(),...itemBox(it)}))
    .filter(it=>it.text);

  if(!clean.length) return [];

  // Ignore the header and group OCR boxes into visual rows by Y position.
  const body=clean.filter(it=>!/^(sl\.?\s*number|slumber|module\s*details|modula\s*detals|qty|tag|tower)$/i.test(it.text));
  body.sort((a,b)=>a.cy-b.cy);

  const heights=body.map(x=>Math.max(1,x.y2-x.y));
  const median=[...heights].sort((a,b)=>a-b)[Math.floor(heights.length/2)]||20;
  const tolerance=Math.max(16, median*0.9);

  const groups=[];
  for(const it of body){
    let g=groups.findLast?.(r=>Math.abs(r.cy-it.cy)<=tolerance);
    if(!g){
      g={cy:it.cy,items:[it]};
      groups.push(g);
    }else{
      g.items.push(it);
      g.cy=average(g.items.map(x=>x.cy));
    }
  }

  const rows=[];
  for(const g of groups){
    const parts={sl:[],module:[],tag:[],tower:[]};

    for(const it of g.items.sort((a,b)=>a.cx-b.cx)){
      const x=it.cx/(imageWidth||1);

      // These normalized bands match the schedule layout shown in the user's sample.
      if(x < 0.16) parts.sl.push(it.text);
      else if(x < 0.50) parts.module.push(it.text);
      else if(x < 0.59) {
        // Qty column intentionally ignored.
      }
      else if(x < 0.93) parts.tag.push(it.text);
      else parts.tower.push(it.text);
    }

    const slText=parts.sl.join(' ').trim();
    const slMatch=slText.match(/\b(\d{1,3})\b/);
    if(!slMatch) continue;

    const sl=slMatch[1];
    if(Number(sl)<1 || Number(sl)>999) continue;

    let module=parts.module.join(' ').replace(/\s+\b1\s*$/,'').trim();
    let tag=normalizeTag(parts.tag.join(' '));
    let tower=(parts.tower.join(' ').match(/[A-Z]/i)||[''])[0].toUpperCase();

    // If the tag box is split by OCR, retain all pieces in their x order.
    const parsed=parseTag(tag);
    rows.push({
      sl,
      module,
      tag,
      towerNo:parsed.towerNo||'',
      level:parsed.level||'',
      tower
    });
  }

  // De-duplicate same serial number and preserve first visual row.
  const seen=new Set();
  return rows.filter(r=>{
    if(seen.has(r.sl)) return false;
    seen.add(r.sl);
    return r.module||r.tag||r.tower;
  });
}

function parseOcr(text){
  // Text-only fallback if position metadata is unavailable.
  const lines=text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const rows=[];
  let current=null;
  function finish(){
    if(!current) return;
    const blob=current.parts.join(' ').replace(/\s+/g,' ').trim();
    const sl=current.sl;
    let tower='';
    const tm=blob.match(/\b([A-Z])\s*$/i);
    let b=blob;
    if(tm){tower=tm[1].toUpperCase();b=b.slice(0,tm.index).trim()}
    const tagStart=b.search(/\bT\s*C/i);
    const module=(tagStart>=0?b.slice(0,tagStart):b).replace(/\s+\b1\s*$/,'').trim();
    const tag=normalizeTag(tagStart>=0?b.slice(tagStart):'');
    const p=parseTag(tag);
    if(sl) rows.push({sl,module,tag,towerNo:p.towerNo||'',level:p.level||'',tower});
    current=null;
  }
  for(const line of lines){
    const m=line.match(/^(\d{1,3})\s+(.*)$/);
    if(m){finish();current={sl:m[1],parts:[m[2]]}}
    else if(current) current.parts.push(line);
  }
  finish();
  return rows;
}

function inferScheduleInfo(text, rows){
  const all=(text||'').replace(/\s+/g,' ').toUpperCase();

  // Common OCR forms from tags such as TC-A02-L38-...
  // OCR may read A02 as AD2/AO2/A2 and L38 as L3B.
  let towerNo='';
  let level='';
  let tower='';

  const a=all.match(/\bA\s*[-:]?\s*([0OD])\s*([0-9]{1,2})\b/);
  if(a){
    const first=String(a[1]).replace(/[OD]/g,'0');
    towerNo='A'+first+String(a[2]).padStart(1,'0');
    if(towerNo.length===3) towerNo='A0'+towerNo.slice(1);
  }

  const l=all.match(/\bL\s*[-:]?\s*([0-9OBD]{1,3})\b/);
  if(l){
    level='L'+l[1].replace(/[OBD]/g,m=>m==='B'?'8':'0');
  }

  // Last single-letter column is often repeated for every row.
  const letters=all.match(/\b[A-Z]\b/g)||[];
  if(letters.length){
    const counts={};
    letters.forEach(x=>counts[x]=(counts[x]||0)+1);
    const best=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    if(best && best[1]>=2) tower=best[0];
  }

  // Use row values as fallback.
  if(!towerNo){
    const vals=rows.map(r=>r.towerNo).filter(Boolean);
    if(vals.length) towerNo=vals.sort((a,b)=>vals.filter(v=>v===b).length-vals.filter(v=>v===a).length)[0];
  }
  if(!level){
    const vals=rows.map(r=>r.level).filter(Boolean);
    if(vals.length) level=vals.sort((a,b)=>vals.filter(v=>v===b).length-vals.filter(v=>v===a).length)[0];
  }
  if(!tower){
    const vals=rows.map(r=>r.tower).filter(Boolean);
    if(vals.length) tower=vals.sort((a,b)=>vals.filter(v=>v===b).length-vals.filter(v=>v===a).length)[0];
  }

  return {towerNo,level,tower};
}

function setScheduleInfo(info){
  $('#scheduleTowerNo').value=info.towerNo||'';
  $('#scheduleLevel').value=info.level||'';
  $('#scheduleTower').value=info.tower||'';
}

function applyScheduleInfo(){
  const towerNo=$('#scheduleTowerNo').value.trim().toUpperCase();
  const level=$('#scheduleLevel').value.trim().toUpperCase();
  const tower=$('#scheduleTower').value.trim().toUpperCase();

  state.draft.forEach(r=>{
    if(towerNo) r.towerNo=towerNo;
    if(level) r.level=level;
    if(tower) r.tower=tower;
  });
  renderDraft();
}

function rowHtml(r,i){return `<tr><td><input data-k="sl" data-i="${i}" value="${r.sl||''}"></td><td><input data-k="module" data-i="${i}" value="${r.module||''}"></td><td><input data-k="tag" data-i="${i}" value="${r.tag||''}"></td><td><input data-k="towerNo" data-i="${i}" value="${r.towerNo||''}"></td><td><input data-k="level" data-i="${i}" value="${r.level||''}"></td><td><input data-k="tower" data-i="${i}" value="${r.tower||''}"></td><td><button class="remove" data-remove="${i}">×</button></td></tr>`}
function renderDraft(){
  $('#draftTable tbody').innerHTML=state.draft.map(rowHtml).join('');
  $$('#draftTable input').forEach(inp=>inp.oninput=()=>{
    let r=state.draft[inp.dataset.i];r[inp.dataset.k]=inp.value;
    if(inp.dataset.k==='tag'){
      r.tag=normalizeTag(inp.value);
      // Keep schedule-level values unless the user explicitly edits those fields.
      const p=parseTag(r.tag);
      if(!$('#scheduleTowerNo').value.trim() && p.towerNo) r.towerNo=p.towerNo;
      if(!$('#scheduleLevel').value.trim() && p.level) r.level=p.level;
    }
  });
  $$('[data-remove]').forEach(b=>b.onclick=()=>{state.draft.splice(b.dataset.remove,1);renderDraft()});
}
const titles={upload:['Upload & Extract','Upload a module schedule photo and automatically read it using free OCR.'],database:['Module Database','Search, filter and manage all saved module records.'],export:['Export Data','Download your module records for use in Excel.']};
$$('.nav').forEach(b=>b.onclick=()=>{$$('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.page').forEach(x=>x.classList.remove('active-page'));$('#'+b.dataset.page).classList.add('active-page');$('#pageTitle').textContent=titles[b.dataset.page][0];$('#pageSubtitle').textContent=titles[b.dataset.page][1];renderDb()});
function handlePhoto(file){
  if(!file){
    $('#ocrStatus').textContent='No photo was selected. Please try again.';
    return;
  }

  // iPhone Files can report an empty MIME type or application/octet-stream
  // even for a valid image. Accept common image extensions as a fallback.
  const name=(file.name||'').toLowerCase();
  const looksLikeImage=(file.type||'').startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(name);

  if(!looksLikeImage){
    toast('Please choose a JPG, PNG, WEBP or HEIC photo.');
    $('#photoInput').value='';
    return;
  }

  try{
    const url=URL.createObjectURL(file);
    const preview=$('#preview');

    if(preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
    preview.dataset.url=url;

    // Show the selected photo immediately. If the preview format is not
    // supported, the file is still retained for OCR.
    preview.onload=()=>{
      $('#previewWrap').classList.remove('hidden');
      $('#dropzone').classList.add('hidden');
    };
    preview.onerror=()=>{
      $('#previewWrap').classList.remove('hidden');
      $('#dropzone').classList.add('hidden');
      $('#ocrStatus').textContent='Photo selected. Preview is unavailable, but you can still tap Extract Data.';
    };
    preview.src=url;

    $('#previewWrap').classList.remove('hidden');
    $('#dropzone').classList.add('hidden');
    $('#ocrStatus').textContent=`Photo selected: ${file.name||'image'}. Tap Extract Data to start free OCR.`;
  }catch(err){
    $('#ocrStatus').textContent='Photo was selected but could not be previewed. Tap Extract Data to continue.';
    toast('Photo selected.');
  }
}

const photoInput=$('#photoInput');
photoInput.addEventListener('change',e=>handlePhoto(e.target.files&&e.target.files[0]));
// Some mobile browsers dispatch input before/along with change.
photoInput.addEventListener('input',e=>handlePhoto(e.target.files&&e.target.files[0]));

// Extra Safari/iPhone fallback: tapping the visible drop zone also requests the picker.
$('#dropzone').onclick=e=>{
  if(e.target.id==='photoInput') return;
  const input=$('#photoInput');
  try{ input.click(); }catch(err){}
};
$('#dropzone').onkeydown=e=>{
  if(e.key==='Enter'||e.key===' '){
    e.preventDefault();
    try{$('#photoInput').click()}catch(err){}
  }
};
$('#removePhoto').onclick=()=>{
  const preview=$('#preview');
  if(preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
  preview.dataset.url='';
  preview.src='';
  $('#photoInput').value='';
  $('#previewWrap').classList.add('hidden');
  $('#dropzone').classList.remove('hidden');
  $('#ocrStatus').textContent='Upload a photo, then tap Extract Data.';
};
$('#extractBtn').onclick=async()=>{
  const file=$('#photoInput').files[0];
  if(!file){toast('Please upload a photo first');return}

  const btn=$('#extractBtn');btn.disabled=true;
  $('#progressWrap').classList.remove('hidden');
  $('#progressBar').style.width='8%';
  $('#progressText').textContent='Preparing free AI OCR...';
  $('#ocrStatus').textContent='Loading the AI OCR engine. The first run can take longer while models are downloaded.';

  let ocr=null;
  try{
    $('#progressBar').style.width='20%';
    $('#progressText').textContent='Loading OCR model...';

    // Use the official browser SDK's default automatic backend selection.
    // This is more compatible with Safari/iPhone than forcing a specific WASM path.
    ocr=await PaddleOCR.create({
      lang:'en',
      ocrVersion:'PP-OCRv5',
      ortOptions:{
        backend:'auto'
      }
    });

    $('#progressBar').style.width='55%';
    $('#progressText').textContent='Reading table positions and text...';

    // Pass the original uploaded File directly to PaddleOCR.
    // This follows the official browser quick-start path and avoids
    // iPhone canvas / ImageBitmap compatibility problems.
    const [result]=await ocr.predict(file,{
      textDetLimitSideLen:2000,
      textRecScoreThresh:0.15
    });

    const items=result?.items||[];
    const raw=items
      .map(it=>{
        const b=itemBox(it);
        return `${it.text}   [x:${Math.round(b.cx)}, y:${Math.round(b.cy)}, score:${Math.round((it.score||0)*100)}%]`;
      }).join('\n');

    $('#rawText').textContent=raw||'No text detected.';
    $('#progressBar').style.width='85%';
    $('#progressText').textContent='Building table rows from OCR positions...';

    state.draft=parsePositionedOcr(items, result?.image?.width || 1);

    // Fallback to text parser if the image has too few usable positioned rows.
    if(!state.draft.length){
      const plain=items.map(x=>x.text).join('\n');
      state.draft=parseOcr(plain);
    }

    const plainText=items.map(x=>x.text).join(' ');
    const scheduleInfo=inferScheduleInfo(plainText,state.draft);
    setScheduleInfo(scheduleInfo);

    // Apply detected common schedule information only when it is actually detected.
    if(scheduleInfo.towerNo || scheduleInfo.level || scheduleInfo.tower){
      state.draft.forEach(r=>{
        if(scheduleInfo.towerNo) r.towerNo=scheduleInfo.towerNo;
        if(scheduleInfo.level) r.level=scheduleInfo.level;
        if(scheduleInfo.tower) r.tower=scheduleInfo.tower;
      });
    }

    if(!state.draft.length){
      toast('AI OCR completed, but no table rows were identified. Try a straighter, clearer photo.');
      state.draft=[{sl:'1',module:'',tag:'',towerNo:'',level:'',tower:''}];
    }else{
      toast(`AI OCR found ${state.draft.length} row(s). Please review before saving.`);
    }

    $('#progressBar').style.width='100%';
    renderDraft();
    $('#reviewCard').classList.remove('hidden');
    $('#reviewCard').scrollIntoView({behavior:'smooth'});
    $('#ocrStatus').textContent='AI OCR completed. Review the extracted data below.';
  }catch(err){
    console.error('ModuleScan AI OCR error:', err);
    const detail=(err && err.message) ? err.message : String(err || 'Unknown error');
    $('#ocrStatus').textContent='AI OCR could not start: ' + detail;
    $('#rawText').textContent='Technical error:\n' + detail + '\n\nPlease send a screenshot of this message so the issue can be fixed.';
    toast('AI OCR could not start. The exact error is now shown below.');
  }finally{
    try{ocr?.dispose?.()}catch(e){}
    btn.disabled=false;
    setTimeout(()=>$('#progressWrap').classList.add('hidden'),500);
  }
};
$('#applyScheduleInfo').onclick=()=>{applyScheduleInfo();toast('Schedule information applied to all rows.')};
$('#addRow').onclick=()=>{state.draft.push({sl:String(state.draft.length+1),module:'',tag:'',towerNo:'',level:'',tower:''});renderDraft()};
$('#clearDraft').onclick=()=>{state.draft=[];renderDraft()};
$('#saveBtn').onclick=()=>{
  let added=0,dupe=0;
  const scheduleTowerNo=$('#scheduleTowerNo').value.trim().toUpperCase();
  const scheduleLevel=$('#scheduleLevel').value.trim().toUpperCase();
  const scheduleTower=$('#scheduleTower').value.trim().toUpperCase();
  state.draft.forEach(r=>{
    if(!r.tag)return;
    r.tag=normalizeTag(r.tag);let p=parseTag(r.tag);
    r.towerNo=scheduleTowerNo||p.towerNo||r.towerNo;
    r.level=scheduleLevel||p.level||r.level;
    r.tower=scheduleTower||r.tower;
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
