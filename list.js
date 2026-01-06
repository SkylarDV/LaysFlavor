import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const API_URL = 'https://laysflavorapi.onrender.com/api/bag';
const PAGE_SIZE = 8;
const DEFAULT_IMAGE = '/assets/chipspreview.png';
const MODEL_PATH = '/assets/chips.glb';

const gridEl = document.getElementById('grid');
const statusEl = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');
const loadMoreBtn = document.getElementById('loadMore');

let allBags = [];
let cursor = 0;
let loading = false;

const FONT_STACKS = {
  standard: 'bold 300px "Helvetica Neue", Helvetica, Arial, "Segoe UI", system-ui, sans-serif',
  decorative: 'bold 300px "Segoe Script", "Kaushan Script", "Courgette", "Sacramento", cursive',
  classic: 'bold 300px Georgia, "Times New Roman", Times, serif'
};

function resolveFont(alias) {
  return FONT_STACKS[alias] || FONT_STACKS.standard;
}

function createTextTexture(text, color = 'white', fontAlias = 'standard') {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(1, -1.5);
  ctx.fillStyle = color === 'black' ? '#000' : '#fff';
  ctx.font = resolveFont(fontAlias);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text || '', canvas.width / 2, -canvas.height / 2);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContainedTextureFromImage(img) {
  const canvasW = 2048;
  const canvasH = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.save();
  ctx.translate(0, canvasH);
  ctx.scale(1, -1);
  const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const dx = (canvasW - drawW) / 2;
  const dy = (canvasH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const modelPromise = new Promise((resolve, reject) => {
  const loader = new GLTFLoader();
  loader.load(
    MODEL_PATH,
    (gltf) => {
      console.log('Model loaded successfully:', gltf);
      resolve(gltf);
    },
    (progress) => console.log('Model loading:', (progress.loaded / progress.total * 100).toFixed(1) + '%'),
    (err) => {
      console.error('Model load failed:', err);
      reject(err);
    }
  );
});

function cloneModel(gltf) {
  const clone = gltf.scene.clone(true);
  const skinnedMeshes = {};
  gltf.scene.traverse((node) => {
    if (node.isSkinnedMesh) skinnedMeshes[node.name] = node;
  });
  const cloneBones = {};
  const cloneSkinnedMeshes = {};
  clone.traverse((node) => {
    if (node.isBone) cloneBones[node.name] = node;
    if (node.isSkinnedMesh) cloneSkinnedMeshes[node.name] = node;
  });
  for (const name in skinnedMeshes) {
    const skinnedMesh = skinnedMeshes[name];
    const cloneSkinnedMesh = cloneSkinnedMeshes[name];
    const skeleton = skinnedMesh.skeleton;
    const clonedBones = skeleton.bones.map(bone => cloneBones[bone.name]);
    cloneSkinnedMesh.bind(new THREE.Skeleton(clonedBones, skeleton.boneInverses), cloneSkinnedMesh.matrixWorld);
  }
  return clone;
}

async function renderBagCard(bag) {
  const card = document.createElement('div');
  card.className = 'card';
  
  // Create canvas with explicit styling
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 240;
  canvas.className = 'thumb';
  canvas.style.display = 'block';
  canvas.style.background = '#f8f5ec';
  
  // Create like button
  const likeBtn = document.createElement('button');
  likeBtn.className = 'like-btn';
  likeBtn.innerHTML = '★';
  likeBtn.setAttribute('aria-label', 'Like this bag');
  likeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    // Get current user
    const storedUser = localStorage.getItem('laysUser');
    if (!storedUser) {
      alert('Please log in to vote');
      return;
    }
    
    try {
      const user = JSON.parse(storedUser);
      console.log('Stored user:', user);
      console.log('User ID:', user.id, 'Bag ID:', bag._id, 'Full bag:', bag);
      
      if (!user.id) {
        alert('User ID not found');
        return;
      }
      if (!bag._id) {
        alert('Bag ID not found');
        return;
      }
      
      const isLiked = likeBtn.classList.contains('liked');
      
      // Send vote request
      const res = await fetch(`https://laysflavorapi.onrender.com/api/vote/${bag._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      
      console.log('Vote response:', res.status, res);
      if (!res.ok) throw new Error('Vote failed');
      
      // Toggle liked state
      likeBtn.classList.toggle('liked');
    } catch (err) {
      console.error('Vote error:', err);
      alert('Failed to register vote');
    }
  });
  
  const meta = document.createElement('div');
  meta.className = 'meta';
  const nameEl = document.createElement('div');
  nameEl.className = 'name';
  nameEl.textContent = bag.name || 'Unnamed Flavor';
  const descEl = document.createElement('div');
  descEl.className = 'desc';
  descEl.textContent = bag.flavor || 'Custom Lays bag';
  meta.append(nameEl, descEl);
  card.append(canvas, likeBtn, meta);
  gridEl.appendChild(card);

  try {
    console.log('renderBagCard:', bag.name);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas });
    renderer.setSize(260, 240, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xf8f5ec, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 260 / 240, 0.1, 100);
    camera.position.set(0, 0.6, 2.0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 8, 6);
    scene.add(dir);

    const gltf = await modelPromise;
    const model = cloneModel(gltf);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar((1 / maxDim) * 2.2);
    model.position.set(0, 0.2, -0.6);
    model.rotation.x = Math.PI / 12;
    model.rotation.y = Math.PI / 6;

    let meshIndex = 0;
    let bagMat = null;
    let textMesh = null;
    let imageMesh = null;

    model.traverse((n) => {
      if (n.isMesh) {
        if (!bagMat) {
          bagMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(bag.colour || '#b6352a'), metalness: 0.1, roughness: 0.3 });
          n.material = bagMat;
        }
        if (meshIndex === 2) {
          textMesh = n;
          textMesh.material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 1, metalness: 0.1, roughness: 0.3 });
        }
        if (meshIndex === 3) {
          imageMesh = n;
          imageMesh.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false });
        }
        meshIndex++;
      }
    });

    if (bagMat && bag.colour) bagMat.color.set(bag.colour);

    if (textMesh) {
      const textTex = createTextTexture(bag.name || 'Classic', (bag.textColour || 'white').toLowerCase(), bag.font || 'standard');
      textMesh.material.map = textTex;
      textMesh.material.needsUpdate = true;
    }

    scene.add(model);
    renderer.render(scene, camera);
    console.log('Rendered:', bag.name);

    // Load image async
    if (imageMesh) {
      loadImage(bag.bagImage || DEFAULT_IMAGE)
        .then(img => {
          const tex = createContainedTextureFromImage(img);
          imageMesh.material.map = tex;
          imageMesh.material.opacity = 1;
          imageMesh.material.needsUpdate = true;
          renderer.render(scene, camera);
        })
        .catch(err => {
          console.warn('Image failed:', err);
          if (bag.bagImage !== DEFAULT_IMAGE) {
            loadImage(DEFAULT_IMAGE).then(img => {
              const tex = createContainedTextureFromImage(img);
              imageMesh.material.map = tex;
              imageMesh.material.opacity = 1;
              imageMesh.material.needsUpdate = true;
              renderer.render(scene, camera);
            });
          }
        });
    }
  } catch (err) {
    console.error('Card error:', bag.name, err);
    if (gridEl.contains(card)) gridEl.removeChild(card);
  }
}

async function fetchBags() {
  statusEl.textContent = 'Loading bags…';
  if (spinnerEl) spinnerEl.style.display = 'block';
  console.log('Fetching bags from:', API_URL);
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    console.log('API Response:', data);
    const bags = Array.isArray(data)
      ? data
      : Array.isArray(data?.bags)
        ? data.bags
        : Array.isArray(data?.data?.bags)
          ? data.data.bags
          : [];
    allBags = bags;
    console.log('Parsed bags:', allBags.length);
    if (spinnerEl) spinnerEl.style.display = 'none';
    if (!allBags.length) {
      statusEl.textContent = 'No bags yet. Be the first!';
      loadMoreBtn.disabled = true;
      return;
    }
    statusEl.textContent = '';
    loadMoreBtn.disabled = false;
    console.log('About to call renderNextPage');
    loading = false;
    renderNextPage();
    console.log('renderNextPage returned');
  } catch (err) {
    console.error('Fetch error:', err);
    if (spinnerEl) spinnerEl.style.display = 'none';
    statusEl.textContent = 'Failed to load bags.';
    loadMoreBtn.disabled = true;
    loading = false;
  }
}

function renderNextPage() {
  console.log('renderNextPage called, cursor:', cursor, 'total:', allBags.length);
  const slice = allBags.slice(cursor, cursor + PAGE_SIZE);
  console.log('Slice has', slice.length, 'bags');
  slice.forEach(bag => {
    console.log('About to render:', bag.name);
    renderBagCard(bag);
  });
  cursor += slice.length;
  if (cursor >= allBags.length) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'All bags loaded';
  } else {
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load more';
  }
}

loadMoreBtn.addEventListener('click', () => {
  renderNextPage();
});

fetchBags();
