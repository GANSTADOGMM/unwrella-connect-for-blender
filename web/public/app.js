import * as THREE from 'three';
import { countUVIslands } from './uv-islands.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

const $ = id => document.getElementById(id);
const stage = $('three-view');
// Keep the workspace usable when the browser cannot provide WebGL.
function canvasRenderer() {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  let width = 1, height = 1, ratio = 1;
  return {
    domElement: canvas,
    setPixelRatio(value) { ratio = value; },
    setSize(w, h) { width = w; height = h; canvas.width = w * ratio; canvas.height = h * ratio; },
    render(scene, camera) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
      const project = v => { const p = v.clone().project(camera); return [(p.x + 1)*width/2, (1-p.y)*height/2, p.z]; };
      ctx.strokeStyle = 'rgba(99,123,103,.18)'; ctx.lineWidth = .6;
      for (let i=-8; i<=8; i++) {
        for (const ends of [[new THREE.Vector3(i,-1.9,-8),new THREE.Vector3(i,-1.9,8)],[new THREE.Vector3(-8,-1.9,i),new THREE.Vector3(8,-1.9,i)]]) {
          const a=project(ends[0]), b=project(ends[1]); if(a[2]>1 || b[2]>1) continue;
          ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
        }
      }
      if (!model) return;
      const faces=[]; const light=new THREE.Vector3(2,4,5).normalize();
      model.traverse(mesh=>{
        if (!mesh.isMesh) return;
        const geo=mesh.geometry, pos=geo.attributes.position, uv=geo.attributes.uv, index=geo.index;
        const points=[], world=[];
        for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);world.push(v);points.push(project(v));}
        const len=index?index.count:pos.count;
        for(let i=0;i+2<len;i+=3){
          const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k), [a,b,c]=ids.map(j=>world[j]);
          const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
          const shade=Math.max(.18,Math.abs(normal.dot(light))*.65+.3);
          let tone=1;
          if(checker && uv){const u=ids.reduce((s,j)=>s+uv.getX(j),0)/3, v=ids.reduce((s,j)=>s+uv.getY(j),0)/3;tone=(Math.floor(u*8)+Math.floor(v*8))%2 ? .68 : 1;}
          faces.push({p:ids.map(j=>points[j]), z:ids.reduce((s,j)=>s+points[j][2],0)/3, shade:shade*tone});
        }
      });
      faces.sort((a,b)=>b.z-a.z);
      for(const face of faces){const [a,b,c]=face.p;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();const s=face.shade;ctx.fillStyle=`rgb(${Math.floor(195*s)},${Math.floor(218*s)},${Math.floor(192*s)})`;ctx.fill();if(wire){ctx.strokeStyle='rgba(39,65,48,.48)';ctx.lineWidth=.45;ctx.stroke();}}
    }
  };
}
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.outputColorSpace = THREE.SRGBColorSpace; }
catch { renderer = canvasRenderer(); }
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
camera.position.set(4.5, 3.1, 6.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 2.8; controls.maxDistance = 15;
scene.add(new THREE.HemisphereLight(0xdce9d7, 0x26352e, 2.1));
const key = new THREE.DirectionalLight(0xf6ffed, 3.2); key.position.set(3, 6, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0xb9ff83, 2); rim.position.set(-4, 1, -4); scene.add(rim);
const grid = new THREE.GridHelper(16, 32, 0x46554c, 0x343f39); grid.position.y = -1.9; grid.material.transparent = true; grid.material.opacity = .45; scene.add(grid);
const checkerCanvas = document.createElement('canvas'); checkerCanvas.width = checkerCanvas.height = 256;
const ck = checkerCanvas.getContext('2d');
for (let y=0; y<8; y++) for (let x=0; x<8; x++) { ck.fillStyle = (x+y)%2 ? '#899e80' : '#e0e7d8'; ck.fillRect(x*32,y*32,32,32); }
const checkerTexture = new THREE.CanvasTexture(checkerCanvas); checkerTexture.colorSpace = THREE.SRGBColorSpace;
const surface = new THREE.MeshStandardMaterial({ color: 0xc3d3c0, roughness: .38, metalness: .22, side: THREE.DoubleSide });
const checkMaterial = new THREE.MeshStandardMaterial({ map: checkerTexture, roughness: .7, side: THREE.DoubleSide });
const wireMaterial = new THREE.LineBasicMaterial({ color: 0x40594c, transparent: true, opacity: .34 });
const loader = new OBJLoader();
let model, sourceObj, resultObj = null, filename = 'Studio sample.obj', wire = true, checker = false, busy = false, loading = false, loadGeneration = 0, toastTimer;

function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500); }
let needsRender = true;
function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w,h,false); camera.aspect = w/h; camera.updateProjectionMatrix(); needsRender = true; }
new ResizeObserver(resize).observe(stage);
function animate() { requestAnimationFrame(animate); const changed = controls.update(); if (changed || needsRender) { renderer.render(scene,camera); needsRender = false; } } animate();

function parseOBJ(text) {
  const parsed = loader.parse(text);
  const meshes = []; parsed.traverse(child => { if (child.isMesh && child.geometry.attributes.position?.count) meshes.push(child); });
  if (!meshes.length) throw new Error('No mesh faces found in this OBJ.');
  return meshes;
}
function showModel(text, label) {
  const meshes = parseOBJ(text);
  const nextModel = new THREE.Group();
  for (const entry of meshes) {
    const geometry = entry.geometry.clone();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, checker ? checkMaterial : surface);
    const lines = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), wireMaterial); lines.visible = wire; mesh.add(lines); nextModel.add(mesh);
  }
  const bounds = new THREE.Box3().setFromObject(nextModel), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const max = Math.max(size.x,size.y,size.z);
  if (!Number.isFinite(max) || max <= 0) { nextModel.traverse(child => { if (child.geometry) child.geometry.dispose(); }); throw new Error('This mesh has invalid dimensions.'); }
  if (model) { scene.remove(model); model.traverse(child => { if (child.geometry) child.geometry.dispose(); }); }
  model = nextModel;
  model.position.sub(center); model.scale.setScalar(3.1 / max); model.position.multiplyScalar(3.1 / max); scene.add(model);
  const counts = { vertices: (text.match(/^\s*v\s+/gm)||[]).length, faces: (text.match(/^\s*f\s+/gm)||[]).length };
  $('model-name').textContent = label.replace(/\.obj$/i,''); $('model-count').textContent = `${counts.faces.toLocaleString()} faces · OBJ mesh`;
  $('stat-vertices').textContent = counts.vertices.toLocaleString(); $('stat-faces').textContent = counts.faces.toLocaleString();
  drawUV(meshes, text); needsRender = true;
}
function drawUV(meshes, obj) {
  const canvas = $('uv-canvas'), ctx = canvas.getContext('2d'), n = canvas.width, pad = 17, span = n-2*pad;
  ctx.fillStyle='#252d26'; ctx.fillRect(0,0,n,n);
  const cell=span/8;
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) {ctx.fillStyle=(x+y)%2?'#29322a':'#303a2f';ctx.fillRect(pad+x*cell,pad+y*cell,cell,cell);}
  ctx.strokeStyle='#66775d';ctx.lineWidth=1;ctx.strokeRect(pad,pad,span,span);
  const triangles=[];
  for (const mesh of meshes) {
    const uv=mesh.geometry.attributes.uv, idx=mesh.geometry.index;
    if (!uv) continue;
    const len=idx ? idx.count : uv.count;
    for(let i=0;i+2<len;i+=3) {
      const t=[]; for(let k=0;k<3;k++){const j=idx?idx.getX(i+k):i+k;t.push([uv.getX(j),uv.getY(j)]);}
      triangles.push(t);
    }
  }
  if (!triangles.length) { ctx.fillStyle='#8c9a88';ctx.textAlign='center';ctx.font='20px sans-serif';ctx.fillText('Unwrap to create UVs',n/2,n/2); $('stat-islands').textContent='—';return; }
  ctx.save();ctx.beginPath();ctx.rect(pad,pad,span,span);ctx.clip();ctx.fillStyle='rgba(160, 209, 123, .17)';ctx.strokeStyle='rgba(191, 238, 157, .68)';ctx.lineWidth=.75;
  for(const t of triangles){ctx.beginPath();t.forEach((p,i)=>{const x=pad+p[0]*span,y=pad+(1-p[1])*span;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();
  $('stat-islands').textContent=countUVIslands(obj).toLocaleString();
}
function setResultAvailable(available) { $('export').disabled = !available; $('export-top').disabled = !available; }
function setSource(text, name) {
  showModel(text,name); sourceObj=text; filename=name; resultObj=null; setResultAvailable(false);
  $('file-name').textContent=name; $('file-info').textContent=name==='Studio sample.obj'?'Sample mesh · ready to unwrap':'OBJ mesh · ready to unwrap';
  $('result-tag').textContent='SOURCE'; $('status').textContent='Ready to unwrap';
}
const sample = new THREE.Mesh(new THREE.TorusKnotGeometry(1.05,.37,120,20,2,3));
setSource(new OBJExporter().parse(sample), filename); $('result-tag').textContent='SAMPLE';

async function loadFile(file) {
  if (!file || busy) return;
  const generation = ++loadGeneration;
  loading = true; $('unwrap').disabled = true; $('status').textContent = 'Loading model…';
  try {
    if (!/\.obj$/i.test(file.name)) throw new Error('Please choose an OBJ file.');
    if (file.size > 10*1024*1024) throw new Error('The OBJ file must be 10 MB or smaller.');
    const contents = await file.text();
    if (generation !== loadGeneration) return;
    setSource(contents, file.name); toast('Model loaded. Ready to unwrap.');
  } catch(error) {
    if (generation === loadGeneration) { $('status').textContent = 'Ready to unwrap'; toast(error.message || 'Could not read this OBJ file.'); }
  } finally {
    if (generation === loadGeneration) { loading = false; $('unwrap').disabled = busy; }
  }
}
$('file').addEventListener('change', event=>{loadFile(event.target.files[0]);event.target.value='';});
const drop=document.querySelector('.upload-zone');
for(const type of ['dragenter','dragover']) drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragover')});
for(const type of ['dragleave','drop']) drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragover')});
drop.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
for (const [id,out,format] of [['angle','angle-out',v=>`${v}°`],['margin','margin-out',v=>Number(v).toFixed(3)],['area','area-out',v=>Number(v).toFixed(2)]]) {
  $(id).addEventListener('input', e=>{ $(out).textContent=format(e.target.value); if(resultObj) $('status').textContent='Settings changed · unwrap again'; });
}
$('unwrap').addEventListener('click', async()=>{
  if(busy || loading) return; busy=true; $('unwrap').disabled=true; $('file').disabled=true; for (const id of ['angle','margin','area']) $(id).disabled=true; $('unwrap').querySelector('span').textContent='Unwrapping…'; $('status').textContent='Unwrapping model…';
  try {
    const response=await fetch('/api/unwrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({obj:sourceObj,settings:{angle:Number($('angle').value),margin:Number($('margin').value),areaWeight:Number($('area').value)}})});
    const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Unwrap failed.');
    showModel(data.obj,filename); resultObj=data.obj; setResultAvailable(true); $('result-tag').textContent='UNWRAPPED'; $('status').textContent='Unwrap complete'; toast('Your UV map is ready to download.');
  } catch(error) { $('status').textContent='Unwrap failed';toast(error.message || 'Could not reach the unwrap engine.'); }
  finally {busy=false;$('unwrap').disabled=false;$('file').disabled=false;for (const id of ['angle','margin','area']) $(id).disabled=false;$('unwrap').querySelector('span').textContent='Unwrap model';}
});
function download(){if(!resultObj)return;const a=document.createElement('a'), url=URL.createObjectURL(new Blob([resultObj],{type:'text/plain'}));a.href=url;a.download=filename.replace(/\.obj$/i,'')+'-unwrapped.obj';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').addEventListener('click',download);$('export-top').addEventListener('click',download);
$('wireframe').addEventListener('click',()=>{wire=!wire;$('wireframe').classList.toggle('selected',wire);$('wireframe').setAttribute('aria-pressed',String(wire));model.traverse(o=>{if(o.isLineSegments)o.visible=wire;});needsRender=true;});
$('checker').addEventListener('click',()=>{checker=!checker;$('checker').classList.toggle('selected',checker);$('checker').setAttribute('aria-pressed',String(checker));model.traverse(o=>{if(o.isMesh)o.material=checker?checkMaterial:surface;});needsRender=true;});
$('reset-view').addEventListener('click',()=>{controls.enableDamping=false;controls.update();controls.reset();controls.enableDamping=true;needsRender=true;});
