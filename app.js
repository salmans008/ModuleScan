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
  let current=null;

  function finish(){
    if(!current) return;
    let blob=current.parts.join(' ').replace(/\s+/g,' ').trim();

    // Serial number
    let sl=current.sl || String(rows.length+1);

    // Tower is usually the final single letter in the OCR row/continuation.
    let tower='';
    let towerMatch=blob.match(/\b([A-Z])\s*$/i);
    if(towerMatch){ tower=towerMatch[1].toUpperCase(); blob=blob.slice(0,towerMatch.index).trim(); }

    // Remove the Qty column (normally 1) only when it follows the module description.
    // Find the start of the Tag column. OCR often removes hyphens, so accept TC/TCA/TCD etc.
    let tagStart=blob.search(/\bT\s*C/i);
    if(tagStart<0) tagStart=blob.search(/\bA\s*[0OD]\s*\d/i);

    let before=tagStart>=0 ? blob.slice(0,tagStart).trim() : blob;
    let tagRaw=tagStart>=0 ? blob.slice(tagStart).trim() : '';

    // Qty is ignored.
    before=before.replace(/\s+\b1\s*$/,'').trim();

    // OCR sometimes joins a continuation line onto the tag.
    // Keep the whole tag-like text, but normalize obvious spacing.
    let tag=normalizeTag(tagRaw);

    // Fuzzy extraction for A02 and L38 when OCR reads 0 as D/O or removes hyphens.
    let towerNo='', level='';
    let tm=tag.match(/A\s*([0OD])\s*(\d{1,2})/i);
    if(tm) towerNo='A0'+tm[2].padStart(2,'0').slice(-2);

    let lm=tag.match(/L\s*([0OD]?\d{1,3})/i);
    if(lm){
      let n=lm[1].replace(/[OD]/gi,'0').replace(/^0+/,'') || '0';
      level='L'+n;
    }

    // If normal parsing succeeded, prefer it.
    const normal=parseTag(tag);
    towerNo=normal.towerNo || towerNo;
    level=normal.level || level;

    // Module details are usually clear in OCR. Remove accidental Qty at the end.
    let module=before.replace(/\s+\d+\s*$/,'').trim();

    // Do not create header/noise rows.
    if(module || tag || current.sl){
      rows.push({sl,module,tag,towerNo,level,tower});
    }
    current=null;
  }

  for(const line of lines){
    if(/^(sl\.?\s*number|slumber|module\s*details|modula\s*detals|qty|tag|tower)$/i.test(line)) continue;

    // A new row normally starts with a serial number 1–25.
    const m=line.match(/^(\d{1,2})\s+(.*)$/);
    if(m && Number(m[1])>=1 && Number(m[1])<=99){
      finish();
      current={sl:m[1],parts:[m[2]]};
    }else if(current){
      // Continuation lines are common because OCR wraps the Tag and Tower columns.
      current.parts.push(line);
    }
  }
  finish();

  // Remove obvious false rows and clean fields.
  const cleaned=rows
    .map(r=>{
      r.module=r.module.replace(/\b(?:PF|PFM|KFM)\s*$/i,m=>m).trim();
      r.tag=normalizeTag(r.tag);
      return r;
    })
    .filter(r=>r.sl || r.module || r.tag);

  return cleaned;
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
