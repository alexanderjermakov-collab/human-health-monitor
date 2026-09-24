"use strict";
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const users=[{id:'default',name:'Default profile',age:'—',gender:'Not specified',height:'—',weight:'—'}], reports=[];let active='default',running=false,timer=null,seconds=40,connected=false,device=null,writer=null,rx=[],samples=[],lastFrame=0,latest=null,sessionReadings=[];
$('date').textContent=new Date().toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
function notify(t){$('notice').textContent=t}function navigate(page){if(!['monitor','reports','users','about'].includes(page))throw Error('Unknown page');document.querySelectorAll('.page').forEach(e=>e.hidden=e.id!==page);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent={monitor:'Human Sensor Health Monitor',reports:'History',users:'Users',about:'About'}[page];$('reportDetail').hidden=true;if(page==='reports')renderReports()}
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
function renderUsers(){$('profile').innerHTML=users.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('');$('profile').value=active;$('userCards').innerHTML=users.map(u=>`<article class="usercard ${u.id===active?'selected':''}"><div class="avatar">${esc(u.name[0].toUpperCase())}</div><div class="userInfo"><h2>${esc(u.name)}</h2><p>${esc(u.gender)} · Age ${esc(u.age||'—')}</p><p>${esc(u.height||'—')} cm · ${esc(u.weight||'—')} kg</p></div><button data-user="${u.id}">${u.id===active?'Active':'Select'}</button></article>`).join('');document.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>{if(running)return notify('Finish or cancel the current measurement before changing profiles.');active=b.dataset.user;renderUsers()})}
$('profile').onchange=()=>{active=$('profile').value;renderUsers()};$('addUser').onclick=()=>$('userDialog').showModal();$('cancelUser').onclick=()=>$('userDialog').close();$('userForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(!d.name.trim())return;users.push({...d,name:d.name.trim(),id:crypto.randomUUID()});if(!running)active=users.at(-1).id;renderUsers();e.target.reset();$('userDialog').close()};
function pressure(v){return [Math.max(90,Math.min(160,Math.trunc(110+1.5*(v.hr-80)))),Math.max(60,Math.min(100,Math.trunc(70+.9*(v.hr-80))))]}
function display(v){for(const k of ['hr','spo','hrv','micro','fatigue'])$(k).textContent=v?v[k]:(['hr','spo'].includes(k)?'00':'--');const bp=v?pressure(v):['--','--'];$('sys').textContent=bp[0];$('dia').textContent=bp[1];$('bp').textContent=bp.join(' / ')}
async function command(cmd,sec){if(!writer)throw Error('Sensor is not connected.');let a=sec===undefined?[170,4,cmd]:[170,5,cmd,sec];a.push(a.reduce((x,y)=>x+y,0)&255);if(writer.properties.writeWithoutResponse)await writer.writeValueWithoutResponse(new Uint8Array(a));else if(writer.properties.write)await writer.writeValueWithResponse(new Uint8Array(a));else throw Error('Remote command channel is not writable.')}
let starting=false,waitingForAck=false,ackTimer=null,ackRx=[],lastPacket=0,scanStarted=0;
async function start(){
 if(starting)return;
 if(running){await finish(false);return}
 if(!connected||!device?.gatt.connected||!writer){notify('Pair remote first. Scanning requires a live sensor connection.');return}
 $('scanDialog').showModal();
}
async function beginScan(){
 $('scanDialog').close();
 if(running||starting)return;
 if(!connected||!device?.gatt.connected||!writer)return notify('Remote disconnected. Pair remote again.');
 starting=true;running=true;waitingForAck=true;ackRx=[];sessionReadings=[];seconds=40;lastFrame=0;lastPacket=0;rx=[];samples=[];display(null);
 $('profile').disabled=true;$('start').classList.add('scanning');$('start').setAttribute('aria-label','Cancel health scan');
 $('countdown').textContent='Wait';$('ringCaption').textContent='Remote confirmation';$('sessionTitle').textContent='Starting sensor…';
 notify('Keep your finger on the sensor. Waiting for the remote to confirm the scan.');
 ackTimer=setTimeout(()=>failScan('The remote did not confirm the scan. Reconnect the remote and try again with your finger covering the sensor.'),10000);
 try{await command(2,40)}catch(e){await failScan('Could not start the sensor: '+e.message)}finally{starting=false}
}
async function failScan(message){await finish(false);notify(message);$('sessionCopy').textContent=message;$('waveLabel').textContent='Scan stopped';}
function receiveResponse(e){
 if(!waitingForAck)return;
 const v=e.target.value;ackRx.push(...new Uint8Array(v.buffer,v.byteOffset,v.byteLength));
 while(ackRx.length>=2){
  if(ackRx[0]!==170||ackRx[1]<5){ackRx.shift();continue}
  const length=ackRx[1];if(ackRx.length<length)return;
  const frame=ackRx.splice(0,length);if(frame[2]!==129)continue;
  // Match the APK's FF02 command/status handling.
  if(frame[3]===0){startCountdown();return}
  const message=frame[3]===1?'Finger not placed correctly. Cover the sensor fully, keep still, and try again.':frame[3]===2?'The remote reported a hardware error. Check the sensor and try again.':'The remote rejected the scan (status '+frame[3]+'). Please try again.';
  failScan(message);return;
 }
}
function startCountdown(){
 if(!running||!waitingForAck)return;
 waitingForAck=false;clearTimeout(ackTimer);scanStarted=Date.now();
 $('countdown').textContent='0%';$('ringCaption').textContent='40s';$('waveLabel').textContent='Waiting for pulse signal';$('sessionTitle').textContent='Scanning…';$('sessionCopy').textContent='Keep your finger still on the sensor';
 notify('Remote confirmed the scan. Keep your finger covering the sensor for 40 seconds.');
 timer=setInterval(()=>{
  if(!connected||!device?.gatt.connected){finish(false);return}
  seconds--;
  if(Date.now()-(lastPacket||scanStarted)>5000){display(null);samples=[];$('waveLabel').textContent='Waiting for sensor signal';notify('The remote accepted the scan, but no recent sensor packets have arrived. Keep your finger on the sensor.');}
  $('countdown').textContent=Math.round((40-seconds)/40*100)+'%';$('ringCaption').textContent=seconds+'s';$('progressArc').setAttribute('stroke-dashoffset',661.619*seconds/40);
  if(seconds<=0)finish(true);
 },1000);
}
$('confirmScan').onclick=beginScan;$('cancelScan').onclick=()=>$('scanDialog').close();
async function finish(save){clearInterval(timer);clearTimeout(ackTimer);waitingForAck=false;ackRx=[];running=false;$('profile').disabled=false;$('start').classList.remove('scanning');$('start').setAttribute('aria-label','Start health scan');if(connected){try{await command(3)}catch(e){notify('Stop command failed: '+e.message)}}$('countdown').textContent='Start';$('ringCaption').textContent='Start Monitoring';$('progressArc').setAttribute('stroke-dashoffset','661.619');$('sessionLabel').textContent='READY';$('sessionTitle').textContent=save?'Session complete':'Select this panel to scan';$('sessionCopy').textContent='Press OK to start';if(save&&sessionReadings.length){const avg={};for(const k of ['hr','spo','hrv','micro','fatigue'])avg[k]=Math.round(sessionReadings.reduce((s,v)=>s+v[k],0)/sessionReadings.length);const r={...avg,id:crypto.randomUUID(),user:users.find(u=>u.id===active).name,date:new Date().toISOString(),source:'Live sensor',count:sessionReadings.length,wave:samples.slice()};reports.unshift(r);display(avg);showReport(r);notify('Measurement complete. Your report is available in Reports & history.')}else if(save)notify('No valid sensor frames received. No report was saved.');else notify('Measurement cancelled. No report was saved.')}
$('start').onclick=start;$('stop').onclick=()=>finish(false);
let historyMetric='Report';const metricKeys={'Report':'hr','Heart Rate':'hr','SpO2':'spo','Microcirculation':'micro','HRV':'hrv','Blood Pressure':'bp','Fatigue':'fatigue'};
function chartSvg(values,color='#35c759'){if(!values.length)return '<div class="empty">No data available</div>';const max=Math.max(...values,1),min=Math.min(...values,0),range=Math.max(max-min,1);const pts=values.map((v,i)=>`${30+i*540/Math.max(values.length-1,1)},${220-(v-min)/range*180}`).join(' ');return `<svg viewBox="0 0 600 260" role="img" aria-label="Measurement trend"><path d="M30 40H570M30 130H570M30 220H570" stroke="#2d241f" fill="none"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3"/>${values.map((v,i)=>`<circle cx="${30+i*540/Math.max(values.length-1,1)}" cy="${220-(v-min)/range*180}" r="5" fill="${color}"/>`).join('')}</svg>`}
function metricValue(r,k){return k==='bp'?pressure(r)[0]:r[k]}
function renderReports(){const rows=reports.filter(r=>r.user===users.find(u=>u.id===active).name).slice(0,10);$('empty').hidden=rows.length>0;$('download').disabled=!reports.length;$('latestReport').disabled=!rows.length;$('historyHeading').textContent=historyMetric;$('history').innerHTML=rows.map(r=>`<button class="record" data-report="${r.id}">${esc(new Date(r.date).toLocaleString())}<small>${esc(r.user)} · ${esc(r.source)} · ${historyMetric==='Report'?r.hr+' bpm / '+r.spo+'%':metricValue(r,metricKeys[historyMetric])}</small></button>`).join('');$('trend').innerHTML=chartSvg(rows.slice().reverse().map(r=>metricValue(r,metricKeys[historyMetric])));$('latestReport').onclick=()=>rows[0]&&showReport(rows[0]);document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>showReport(reports.find(x=>x.id===b.dataset.report)))}
function showReport(r){const rows=reports.filter(x=>x.user===r.user).slice(0,10).reverse();const metrics=[['Heart Rate','hr','bpm'],['SpO2','spo','%'],['Microcirculation','micro',''],['HRV','hrv','ms'],['Blood Pressure','bp',''],['Fatigue','fatigue','']];const bp=pressure(r);$('reportDetail').innerHTML=`<article class="panel reportMain"><div class="reportHeader"><button id="reportBack">Back</button><h2>Health Check Report</h2><div class="score">CURRENT SCORE<strong>— <small>PTS</small></strong></div></div><div class="reportGauges"><div class="reportGauge"><div class="gauge">${r.hr}<small>BPM</small></div><span>|</span><b>Heart Rate</b></div><div class="reportGauge"><div class="gauge">${r.spo}<small>%</small></div><span>|</span><b>SpO2</b></div></div><div class="reportTiles">${[['microcirculation','Microcirculation',r.micro],['hrv','HRV',r.hrv+' ms'],['pressure','Blood Pressure',bp.join('/')],['hrv','Fatigue',r.fatigue]].map(([icon,label,v])=>`<div class="tile"><img src="assets/${icon}.png" alt=""><div>${label}<strong>${v}</strong></div></div>`).join('')}</div><div class="reportCharts"><div class="chart"><h3>Heart Waveform</h3>${chartSvg(r.wave||[])}</div><div class="chart"><h3>Recent Heart Rate</h3>${chartSvg(rows.map(x=>x.hr))}</div></div><div class="reportAdvice"><h3>${esc(r.user)} · ${esc(r.source)}</h3><p>${esc(new Date(r.date).toLocaleString())} · ${r.count} readings averaged.<br>Blood pressure is estimated from heart rate. No clinical score or diagnosis is provided. ${r.source==='Demo'?'All measurements in this report are simulated.':'Sensor integration is experimental.'}</p></div></article><article class="panel reportAside"><h2>Recent 10-Scan Data</h2><p>Summarizes 10-scan trends for heart rate, SpO2, microcirculation, HRV, blood pressure, and fatigue.</p><div class="overall"><span>Overall Health Score</span><strong>—</strong><small>Not assessed</small></div><div class="miniCharts">${metrics.map(([label,k,unit])=>{const values=rows.map(x=>metricValue(x,k));return `<div class="miniChart"><h3>${label}<span>LAST 10</span></h3>${chartSvg(values)}<div class="miniValues"><div>Current<strong>${k==='bp'?bp.join('/'):r[k]} ${unit}</strong></div><div>AVG 10<strong>${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)} ${unit}</strong></div></div></div>`}).join('')}</div></article>`;$('reportDetail').hidden=false;$('reportBack').onclick=()=>{$('reportDetail').hidden=true;navigate('reports')}}
$('historyNav').innerHTML=Object.keys(metricKeys).map((m,i)=>`<button class="${i===0?'active':''}" data-metric="${m}">${m}</button>`).join('');document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{historyMetric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.classList.toggle('active',x===b));renderReports()});
$('download').onclick=()=>{const safe=v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const rows=[['Time','Profile','Source','Heart rate (bpm)','SpO2 (%)','HRV (ms)','Microcirculation','Fatigue'],...reports.map(r=>[r.date,r.user,r.source,r.hr,r.spo,r.hrv,r.micro,r.fatigue])];const url=URL.createObjectURL(new Blob([rows.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='health-monitor-reports.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const uuid=n=>`0000${n}-0000-1000-8000-00805f9b34fb`;
function receive(e){if(!running||waitingForAck)return;rx.push(...new Uint8Array(e.target.value.buffer,e.target.value.byteOffset,e.target.value.byteLength));while(rx.length>=92){if(rx[0]!==170||rx[1]!==92||rx[2]!==16||rx[3]!==255){rx.shift();continue}const f=rx.slice(0,92);if((f.slice(0,91).reduce((s,v)=>s+v,0)&255)!==f[91]){rx.shift();continue}rx.splice(0,92);lastPacket=Date.now();samples.push(...f.slice(4,68).map(v=>v>127?v-256:v));samples=samples.slice(-512);if(!f[68]||!f[69]){display(null);$('waveLabel').textContent='Receiving pulse signal · calculating readings';$('sessionCopy').textContent='Keep your finger still on the sensor';notify('Sensor signal received. Waiting for heart rate and oxygen readings. Keep your finger covering the sensor.');continue}latest={hr:f[68],spo:f[69],micro:f[70],fatigue:f[71],hrv:f[79]};lastFrame=Date.now();sessionReadings.push({...latest});display(latest);$('sessionCopy').textContent='Receiving live sensor readings';$('waveLabel').textContent='Live sensor waveform';notify('Receiving measurements from '+(device?.name||'remote')+'. Blood-pressure values remain estimates.');}if(rx.length>4096)rx=[]}
let permittedRemotes=[];
async function connect(){
 if(running)return notify('Finish or cancel the measurement before connecting.');
 if(connected){device.gatt.disconnect();return}
 if(!navigator.bluetooth)return notify('Bluetooth requires desktop Chrome or Edge over HTTPS.');
 $('connect').disabled=true;
 try{
  permittedRemotes=typeof navigator.bluetooth.getDevices==='function'?await navigator.bluetooth.getDevices():[];
  $('remoteList').innerHTML=permittedRemotes.map((remote,index)=>`<button class="remoteDevice" data-remote="${index}"><span><strong>${esc(remote.name||'Unnamed health remote')}</strong><small>Previously authorized for this website</small></span><b>Connect</b></button>`).join('');
  $('remoteEmpty').hidden=permittedRemotes.length>0;
  $('remoteHelp').textContent=permittedRemotes.length?'Select a saved remote, or find another paired or nearby remote.':'Windows pairing and website access are separate. Select Find once to authorize this remote for the website.';
  document.querySelectorAll('[data-remote]').forEach(button=>button.onclick=()=>connectDevice(permittedRemotes[Number(button.dataset.remote)]));
  $('remoteDialog').showModal();
 }catch(e){notify('Could not read saved remotes: '+e.message)}finally{$('connect').disabled=false}
}
async function requestRemote(){
 $('remoteDialog').close();
 try{
  notify('Select the health remote in the browser list. A Windows-paired remote must be awake and advertising.');
  const selected=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[uuid('ff00')]});
  await connectDevice(selected);
 }catch(e){notify(e.name==='NotFoundError'?'No remote selected. Wake the remote or put it in pairing mode, then try again. Windows pairing alone does not grant a website access.':'Could not select the remote: '+e.message)}
}
async function connectDevice(selected){
 if(!selected)return;
 $('remoteDialog').close();$('connect').disabled=true;device=selected;let pairingStage='connection';
 notify('Connecting to '+(device.name||'health remote')+'…');
 try{
  const server=device.gatt.connected?device.gatt:await device.gatt.connect();
  pairingStage='service';const service=await server.getPrimaryService(uuid('ff00'));
  pairingStage='characteristics';writer=await service.getCharacteristic(uuid('ff01'));
  const notifyChar=await service.getCharacteristic(uuid('ff02'));notifyChar.addEventListener('characteristicvaluechanged',receiveResponse);await notifyChar.startNotifications();
  const dataChar=await service.getCharacteristic(uuid('ff03'));dataChar.addEventListener('characteristicvaluechanged',receive);await dataChar.startNotifications();
  connected=true;rx=[];samples=[];display(null);$('deviceName').textContent=device.name||'Health sensor';$('connect').classList.add('connected');$('subtitle').textContent='Live sensor mode · Ready to scan';$('modeBadge').textContent='SENSOR · EXPERIMENTAL';$('waveLabel').textContent='Sensor waveform · experimental decoding';$('signalLabel').textContent='WAITING FOR DATA';$('sessionCopy').textContent='Start a 40-second sensor measurement.';notify('Sensor connected. This remote will be offered directly next time in this browser.');
  device.addEventListener('gattserverdisconnected',()=>{connected=false;writer=null;if(running)finish(false);samples=[];rx=[];$('deviceName').textContent='Pair remote';$('connect').classList.remove('connected');$('subtitle').textContent='Live sensor mode · Pair remote to scan';$('modeBadge').textContent='LIVE SENSOR MODE';$('waveLabel').textContent='Waiting for remote connection';$('signalLabel').textContent='NO SIGNAL';latest=null;display(null);notify('Remote disconnected. Select Pair remote to reconnect the saved remote.')},{once:true});
 }catch(e){if(device?.gatt.connected)device.gatt.disconnect();writer=null;connected=false;$('deviceName').textContent='Pair remote';$('connect').classList.remove('connected');notify(pairingStage==='service'&&e.name==='NotFoundError'?'This device does not expose the required health-sensor service (FF00).':pairingStage==='characteristics'&&e.name==='NotFoundError'?'The selected remote lacks the expected health-sensor channels.':'Connection failed during '+pairingStage+': '+e.message)}finally{$('connect').disabled=false}
}
$('cancelRemote').onclick=()=>$('remoteDialog').close();
$('findRemote').onclick=requestRemote;
$('connect').onclick=connect;
const canvas=$('wave'),ctx=canvas.getContext('2d');let tick=0;function draw(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;if(w&&h){if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.strokeStyle='#2d241f';ctx.fillStyle='#a09c95';ctx.font='19px Arial';ctx.lineWidth=1;for(const n of [300,150,0]){const y=h-24-n/300*(h-44);ctx.beginPath();ctx.moveTo(50,y);ctx.lineTo(w-20,y);ctx.stroke();ctx.fillText(String(n),8,y+6)}if(samples.length){ctx.beginPath();ctx.strokeStyle='#35c759';ctx.lineWidth=3;for(let x=50;x<w-20;x++){const v=samples[Math.min(samples.length-1,Math.floor((x-50)/(w-70)*samples.length))]+128;const y=h-24-v/300*(h-44);if(x===50)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)tick+=1.1}}requestAnimationFrame(draw)}
function fitStage(){if(innerWidth<850){$('stage').style.transform='none';$('stage').style.marginLeft='0';document.body.style.height='auto';document.body.style.overflow='auto';return}const scale=Math.min(innerWidth/1920,innerHeight/1080);$('stage').style.transform=`scale(${scale})`;$('stage').style.marginLeft=Math.max(0,(innerWidth-1920*scale)/2)+'px';document.body.style.height=1080*scale+'px';document.body.style.overflow='hidden'}addEventListener('resize',fitStage);fitStage();
$('ticks').innerHTML=Array.from({length:60},(_,i)=>{const a=i*Math.PI/30;return `<line x1="${135+118.8*Math.cos(a)}" y1="${135+118.8*Math.sin(a)}" x2="${135+129.6*Math.cos(a)}" y2="${135+129.6*Math.sin(a)}" stroke="#52433a" stroke-width="3.375"/>`}).join('');
function navigateFocus(key){const aliases={Left:'ArrowLeft',Right:'ArrowRight',Up:'ArrowUp',Down:'ArrowDown'};key=aliases[key]||key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))return false;const nodes=[...document.querySelectorAll('button,select')].filter(x=>x.getClientRects().length&&!x.disabled);if(!nodes.length)return false;const active=document.activeElement;if(!nodes.includes(active)){nodes[0].focus({preventScroll:true});return true}const a=active.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2,vertical=key==='ArrowUp'||key==='ArrowDown',sign=key==='ArrowLeft'||key==='ArrowUp'?-1:1;const best=nodes.filter(n=>n!==active).map(node=>{const r=node.getBoundingClientRect(),dx=r.left+r.width/2-ax,dy=r.top+r.height/2-ay,primary=(vertical?dy:dx)*sign,secondary=Math.abs(vertical?dx:dy),overlap=vertical?Math.max(0,Math.min(a.right,r.right)-Math.max(a.left,r.left)):Math.max(0,Math.min(a.bottom,r.bottom)-Math.max(a.top,r.top));return{node,primary,score:primary+secondary*2-(overlap>0?Math.min(overlap,100):0)}}).filter(c=>c.primary>1).sort((x,y)=>x.score-y.score)[0];if(best)best.node.focus({preventScroll:true});return true}
window.hhmNavigateKey=navigateFocus;
addEventListener('keydown',e=>{const key={37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown'}[e.keyCode]||e.key;if(key==='Escape'&&!$('reportDetail').hidden){$('reportDetail').hidden=true;return}if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||!navigateFocus(key))return;e.preventDefault()});
renderUsers();display(null);renderReports();draw();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});for(const tool of [{name:'view_health_dashboard',description:'Navigate to a health dashboard page.',inputSchema:{type:'object',properties:{page:{type:'string',enum:['monitor','reports','users']}},required:['page'],additionalProperties:false},annotations:{readOnlyHint:false},execute:({page})=>{navigate(page);return {page}}},{name:'read_session_reports',description:'Read completed health reports for this tab session.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({reports})}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}}}
