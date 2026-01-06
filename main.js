import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;


document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

renderer.domElement.style.position = 'fixed';
renderer.domElement.style.left = '0';
renderer.domElement.style.top = '0';
renderer.domElement.style.zIndex = '0';
renderer.domElement.style.width = '100vw';
renderer.domElement.style.height = '100vh';

function updateRendererViewport() {
    const menuEl = document.getElementById('menu');
    const menuWidth = menuEl ? Math.round(menuEl.getBoundingClientRect().width) : 0;

    const visW = Math.max(1, window.innerWidth - menuWidth);
    const visH = Math.max(1, window.innerHeight);

    renderer.setSize(visW, visH);
    renderer.domElement.style.width = visW + 'px';
    renderer.domElement.style.height = visH + 'px';
    renderer.domElement.style.right = menuWidth + 'px';

    if (camera) {
        camera.aspect = visW / visH;
        camera.updateProjectionMatrix();
    }
}

window.addEventListener('load', () => updateRendererViewport());

const scene = new THREE.Scene();

const params = {
    envPath: '/assets/background.hdr',
};

const defaultBackground = '#dddddd';
scene.background = new THREE.Color(defaultBackground);

const bagColorSwatches = Array.from(document.querySelectorAll('.color-swatch'));
const getBagColor = () => {
    const selected = document.querySelector('.color-swatch.selected');
    return selected ? selected.dataset.color : '#ff6666';
};
const markSelectedSwatch = (btn) => {
    bagColorSwatches.forEach(b => b.classList.toggle('selected', b === btn));
};

const yawBase = Math.PI / 6;        
const yawHalfRange = Math.PI / 3;  
const clampYaw = (y) => Math.min(yawBase + yawHalfRange, Math.max(yawBase - yawHalfRange, y));

const DEFAULT_BAG_COLOR = '#b6352a';
const DEFAULT_FLAVOR_NAME = 'Classic';
const DEFAULT_TEXT_COLOR = 'white';
const DEFAULT_FONT = 'standard';

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

let currentEnvMap = null; 
let skyMesh = null;
let envLoaded = false;
let modelLoaded = false;

function checkLoadingComplete() {
    if (envLoaded && modelLoaded) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }
}

function loadEnvironment(path) {
    const loader = new RGBELoader();
    loader.load(path, (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const envMap = pmremGenerator.fromEquirectangular(hdr).texture;

        if (currentEnvMap && currentEnvMap !== envMap) {
            currentEnvMap.dispose();
        }
        currentEnvMap = envMap;
        scene.environment = envMap; // reflections/light (unrotated)

        // Build a skydome with the HDR texture so we can rotate view
        if (skyMesh) {
            scene.remove(skyMesh);
            skyMesh.geometry.dispose();
            skyMesh.material.dispose();
            skyMesh = null;
        }
        const skyGeo = new THREE.SphereGeometry(100, 64, 64);
        const skyMat = new THREE.MeshBasicMaterial({
            map: hdr,
            side: THREE.BackSide,
            toneMapped: false,
        });
        skyMesh = new THREE.Mesh(skyGeo, skyMat);
        skyMesh.rotation.y = Math.PI / 2; // rotate 90° to the left
        scene.add(skyMesh);
        // Remove default flat color background so skydome is visible
        scene.background = null;
        
        envLoaded = true;
        checkLoadingComplete();
    }, undefined, (err) => console.error('Error loading env texture:', err));
}

loadEnvironment(params.envPath);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0.8, 2.5);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(3, 10, 10);

dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 50;
dir.shadow.camera.left = -5;
dir.shadow.camera.right = 5;
dir.shadow.camera.top = 5;
dir.shadow.camera.bottom = -5;
dir.shadow.bias = -0.0005;
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.ShadowMaterial({ opacity: 0.2 }) 
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

let model = null;
let bagMaterial = null;
let textMesh = null;
let imageMesh = null;
const defaultImagePath = '/assets/chipspreview.png';
const BAG_SUBMIT_API = 'https://laysflavorapi.onrender.com/api/bag';
let bagImageData = defaultImagePath;

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

function applyImageTexture(texture) {
    if (!imageMesh) return;
    imageMesh.material.map = texture;
    imageMesh.material.opacity = 1;
    imageMesh.material.alphaTest = 0.0;
    imageMesh.material.needsUpdate = true;
}

function buildUploadDataUrl(img, maxDim = 512, quality = 0.7) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    // Explicitly enable alpha channel
    const ctx = canvas.getContext('2d', { alpha: true });
    // Set fillStyle to transparent and fill to ensure alpha channel is active
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    // Use WebP for better compression with transparency support
    return canvas.toDataURL('image/webp', quality);
}
new GLTFLoader().load('/assets/chips.glb', (g) => {
    model = g.scene;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar((1 / maxDim) * 2);

    model.position.set(-0.25, 0.5, -0.75);
    model.rotation.x = Math.PI / 12;
    model.rotation.y = yawBase;

    let bagAssigned = false;
    let meshIndex = 0;
    model.traverse((n) => {
        if (n.isMesh) { // 1: bag 2: lays logo 3: text 4: image
            if (!bagAssigned) {
                bagMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(getBagColor()), metalness: 0.1, roughness: 0.3, transparent: true, opacity: 1 });
                n.material = bagMaterial;
                bagAssigned = true;
            }
            if (meshIndex === 2) {
                textMesh = n;
                textMesh.material = new THREE.MeshStandardMaterial({ 
                    transparent: true, 
                    opacity: 0,
                    metalness: 0.1, 
                    roughness: 0.3 
                });
            }
            if (meshIndex === 3) {
                imageMesh = n;
                // Use unlit material so uploaded image keeps its original brightness
                imageMesh.material = new THREE.MeshBasicMaterial({
                    transparent: true,
                    opacity: 0,
                    toneMapped: false,
                });
            }
            meshIndex++;
            n.castShadow = true;
            n.receiveShadow = true;
        }
    });

    scene.add(model);
    // Render default text immediately so it's visible before typing
    updateFlavorText('Classic');

    // Load default image into layer 4 using same contain logic
    const defaultImg = new Image();
    defaultImg.onload = () => {
        const tex = createContainedTextureFromImage(defaultImg);
        applyImageTexture(tex);
        bagImageData = defaultImagePath;
        
        modelLoaded = true;
        checkLoadingComplete();
    };
    defaultImg.onerror = (err) => {
        console.error('Error loading default image:', err);
        modelLoaded = true;
        checkLoadingComplete();
    };
    defaultImg.src = defaultImagePath;
}, undefined, (err) => console.error('Error loading GLB:', err));

if (bagColorSwatches.length) {
    bagColorSwatches.forEach(btn => {
        btn.addEventListener('click', () => {
            markSelectedSwatch(btn);
            if (bagMaterial) {
                bagMaterial.color.set(btn.dataset.color);
            }
        });
    });
}

function resetConfigurator() {
    // Reset bag color to default
    const defaultColorSwatch = bagColorSwatches.find(b => b.dataset.color === DEFAULT_BAG_COLOR);
    if (defaultColorSwatch) {
        markSelectedSwatch(defaultColorSwatch);
        if (bagMaterial) {
            bagMaterial.color.set(DEFAULT_BAG_COLOR);
        }
    }

    // Reset flavor name
    if (flavorNameInput) {
        flavorNameInput.value = DEFAULT_FLAVOR_NAME;
        updateFlavorText(DEFAULT_FLAVOR_NAME);
    }

    // Reset text color
    const defaultTextSwatch = textColorSwatches.find(b => b.dataset.color === DEFAULT_TEXT_COLOR);
    if (defaultTextSwatch) {
        markSelectedTextSwatch(defaultTextSwatch);
        if (flavorNameInput) {
            updateFlavorText(flavorNameInput.value);
        }
    }

    // Reset font
    if (bagFontSelect) {
        bagFontSelect.value = DEFAULT_FONT;
        if (flavorNameInput) {
            updateFlavorText(flavorNameInput.value);
        }
    }

    // Reset flavor description
    const flavorDescEl = document.getElementById('flavorDesc');
    if (flavorDescEl) {
        flavorDescEl.value = '';
    }

    // Reset image upload
    if (bagImageInputEl) {
        bagImageInputEl.value = '';
        // Reset to default image
        const defaultImg = new Image();
        defaultImg.onload = () => {
            const tex = createContainedTextureFromImage(defaultImg);
            applyImageTexture(tex);
            bagImageData = defaultImagePath;
        };
        defaultImg.src = defaultImagePath;
    }

    // Reset model rotation and position
    if (model) {
        model.rotation.y = yawBase;
        model.position.set(-0.25, 0.5, -0.75);
    }

    // Go back to section 1
    const currentSection = document.querySelector('.menu-section.active');
    if (currentSection) {
        currentSection.classList.remove('active');
    }
    document.getElementById('section1').classList.add('active');
    const dragHint = document.getElementById('dragHint');
    if (dragHint) dragHint.style.display = 'block';
}

// Add reset button event listener
const resetBtn = document.getElementById('resetBtn');
if (resetBtn) {
    resetBtn.addEventListener('click', resetConfigurator);
}

const flavorNameInput = document.getElementById('flavorName');
const bagFontSelect = document.getElementById('bagFont');
const textColorSwatches = Array.from(document.querySelectorAll('.text-color-swatch'));
const loginForm = document.getElementById('loginForm');
const loginNameInput = document.getElementById('loginName');
const loginPasswordInput = document.getElementById('loginPassword');
const loginStatus = document.getElementById('loginStatus');
const logoutBtn = document.getElementById('logoutBtn');
const submitBtnEl = document.getElementById('submitBtn');
const flavorDescEl = document.getElementById('flavorDesc');
const submitModal = document.getElementById('submitModal');
const confirmSubmitBtn = document.getElementById('confirmSubmit');
const cancelSubmitBtn = document.getElementById('cancelSubmit');
let currentUser = null;
const LOGIN_API = 'https://laysflavorapi.onrender.com/api/user/login';

function getStoredUser() {
    try {
        const raw = localStorage.getItem('laysUser');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.name) return parsed;
    } catch (err) {
        console.warn('Unable to read stored user', err);
    }
    return null;
}

function persistUser(user) {
    try {
        localStorage.setItem('laysUser', JSON.stringify({ name: user.name, token: user.token || null, id: user.id || null }));
    } catch (err) {
        console.warn('Unable to persist user', err);
    }
}

function clearStoredUser() {
    try {
        localStorage.removeItem('laysUser');
    } catch (err) {
        console.warn('Unable to clear stored user', err);
    }
}

function updateSubmitCta() {
    if (!submitBtnEl) return;
    if (currentUser) {
        submitBtnEl.textContent = `Post this bag as ${currentUser.name}`;
        submitBtnEl.disabled = false;
    } else {
        submitBtnEl.textContent = 'Log in to post';
        submitBtnEl.disabled = true;
    }
}

function updateLoginUi() {
    const loggedIn = !!currentUser;
    if (loginForm) loginForm.style.display = loggedIn ? 'none' : 'flex';
    if (loginStatus) {
        loginStatus.textContent = loggedIn ? `Logged in as ${currentUser.name}` : 'Log in to post your flavor.';
        loginStatus.style.color = '#444';
    }
    if (logoutBtn) logoutBtn.style.display = loggedIn ? 'inline-flex' : 'none';
    updateSubmitCta();
}

function setLoginMessage(msg, isError = false) {
    if (!loginStatus) return;
    loginStatus.textContent = msg;
    loginStatus.style.color = isError ? '#b00020' : '#444';
}

function setLoginBusy(isBusy) {
    if (!loginForm) return;
    Array.from(loginForm.elements).forEach((el) => {
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
            el.disabled = isBusy;
        }
    });
}

async function loginUserViaApi(username, password) {
    const res = await fetch(LOGIN_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const message = (data && (data.message || data.error)) || 'Login failed';
        throw new Error(message);
    }
    const token = data && (data.token || data.jwt || data.accessToken || data.access_token || null);
    const userName = (data && (data.username || data.name || data.user?.username || data.user?.name)) || username;
    const userId = (data && (data.user?._id || data.user?.id || data._id || data.id)) || null;
    return { name: userName, token, id: userId, raw: data };
}

const storedUser = getStoredUser();
if (storedUser) currentUser = storedUser;
updateLoginUi();

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = loginNameInput ? loginNameInput.value.trim() : '';
        const password = loginPasswordInput ? loginPasswordInput.value.trim() : '';
        if (!name || !password) {
            setLoginMessage('Username and password are required.', true);
            return;
        }
        setLoginBusy(true);
        setLoginMessage('Signing in…');
        try {
            const result = await loginUserViaApi(name, password);
            currentUser = { name: result.name, token: result.token || null, id: result.id || null };
            persistUser(currentUser);
            if (loginPasswordInput) loginPasswordInput.value = '';
            updateLoginUi();
            setLoginMessage(`Logged in as ${currentUser.name}`);
        } catch (err) {
            setLoginMessage(err.message || 'Login failed', true);
        } finally {
            setLoginBusy(false);
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        clearStoredUser();
        if (loginNameInput) loginNameInput.value = '';
        if (loginPasswordInput) loginPasswordInput.value = '';
        updateLoginUi();
    });
}

const getTextColor = () => {
    const selected = textColorSwatches.find(b => b.classList.contains('selected'));
    return selected ? selected.dataset.color : 'black';
};

const markSelectedTextSwatch = (btn) => {
    textColorSwatches.forEach(b => b.classList.toggle('selected', b === btn));
};

const FONT_STACKS = {
    // standard: Helvetica-first stack with sensible fallbacks
    standard: 'bold 400px "Helvetica Neue", Helvetica, Arial, "Segoe UI", system-ui, sans-serif',
    // decorative: more legible handwritten/script options with fallbacks
    decorative: 'bold 400px "Segoe Script", "Kaushan Script", "Courgette", "Sacramento", cursive',
    // classic: readable serif stack for a traditional vibe
    classic: 'bold 400px Georgia, "Times New Roman", Times, serif'
};

function resolveFontStack(alias) {
    return FONT_STACKS[alias] || FONT_STACKS.standard;
}

function updateFlavorText(text) {
    if (!textMesh) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 2048;
    canvas.height = 1024;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(1, -1.5); // flip vertical only
    const fill = getTextColor() === 'white' ? '#ffffff' : '#000000';
    ctx.fillStyle = fill;
    const selectedAlias = bagFontSelect ? bagFontSelect.value : 'standard';
    ctx.font = resolveFontStack(selectedAlias);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || '', canvas.width / 2, -canvas.height / 2);
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    textMesh.material = new THREE.MeshStandardMaterial({
        map: texture,
        metalness: 0.1,
        roughness: 0.3,
        transparent: true,
        alphaTest: 0.1
    });
}

if (flavorNameInput) {
    flavorNameInput.addEventListener('input', (e) => {
        updateFlavorText(e.target.value);
    });
    
    setTimeout(() => {
        if (textMesh && flavorNameInput.value) {
            updateFlavorText(flavorNameInput.value);
        }
    }, 100);
}

if (bagFontSelect) {
    bagFontSelect.addEventListener('change', () => {
        if (flavorNameInput) {
            updateFlavorText(flavorNameInput.value);
        }
    });
}

if (textColorSwatches.length) {
    textColorSwatches.forEach(btn => {
        btn.addEventListener('click', () => {
            markSelectedTextSwatch(btn);
            if (flavorNameInput) {
                updateFlavorText(flavorNameInput.value);
            }
        });
    });
}

let dragging = false, px = 0, py = 0;
renderer.domElement.style.touchAction = 'none';

renderer.domElement.addEventListener('pointerdown', (e) => {
    dragging = true;
    px = e.clientX; py = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
    if (!dragging || !model) return;
    const dx = e.clientX - px;
    const rotateSpeed = 0.005;
    model.rotation.y = clampYaw(model.rotation.y + dx * rotateSpeed);
    px = e.clientX; py = e.clientY;
});

renderer.domElement.addEventListener('pointerup', (e) => {
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
});
renderer.domElement.addEventListener('pointercancel', () => dragging = false);

window.addEventListener('resize', () => {
    updateRendererViewport();
});

(function animate() {
    requestAnimationFrame(animate);
    // Keep skydome centered on camera so it appears as background
    if (skyMesh && camera) {
        skyMesh.position.copy(camera.position);
    }
    renderer.render(scene, camera);
})();

// Fast spin + fade out on submit confirm
let spinoutActive = false;
let spinoutStart = 0;
const SPINOUT_DURATION = 900; // ms
const SPINOUT_SPEED = 8.0; // radians per second
const SPINOUT_LIFT = 0.35; // units to move up during spin
let spinoutStartY = 0;

window.addEventListener('bag-spinout', () => {
    if (!model) return;
    spinoutActive = true;
    spinoutStart = performance.now();
    spinoutStartY = model.position.y;
    // ensure all materials can fade
    model.traverse((n) => {
        if (n.isMesh && n.material) {
            const mat = n.material;
            if (Array.isArray(mat)) {
                mat.forEach(m => { m.transparent = true; m.opacity = 1; });
            } else {
                mat.transparent = true;
                mat.opacity = 1;
            }
        }
    });
});

// overlay animation step into render loop
const _origRender = renderer.render.bind(renderer);
renderer.render = (sc, cam) => {
    if (spinoutActive && model) {
        const now = performance.now();
        const t = Math.min(1, (now - spinoutStart) / SPINOUT_DURATION);
        // spin
        model.rotation.y += SPINOUT_SPEED * (1/60); // approximate per-frame step
        // lift up slightly using ease-out
        const lift = SPINOUT_LIFT * (t * (2 - t));
        model.position.y = spinoutStartY + lift;
        // fade
        const alpha = 1 - t;
        model.traverse((n) => {
            if (n.isMesh && n.material) {
                const mat = n.material;
                if (Array.isArray(mat)) {
                    mat.forEach(m => { m.opacity = alpha; });
                } else {
                    mat.opacity = alpha;
                }
            }
        });
        if (t >= 1) {
            spinoutActive = false;
            model.visible = false;
            model.position.y = spinoutStartY;
            // Redirect to homepage after animation completes
            window.location.href = '/';
        }
    }
    _origRender(sc, cam);
};

// Image upload to layer 4 (cover one side, crop overflow)
const bagImageInputEl = document.getElementById('bagImage');
if (bagImageInputEl) {
    bagImageInputEl.addEventListener('change', () => {
        const file = bagImageInputEl.files && bagImageInputEl.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const texture = createContainedTextureFromImage(img);
                applyImageTexture(texture);
                bagImageData = buildUploadDataUrl(img, 900, 0.7);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

// Submit handling
if (cancelSubmitBtn && submitModal) {
    cancelSubmitBtn.addEventListener('click', () => {
        submitModal.classList.remove('active');
    });
}

window.addEventListener('bag-submit-clicked', () => submitBag());

function setSubmitBusy(isBusy) {
    if (submitBtnEl) submitBtnEl.disabled = isBusy || !currentUser;
    if (confirmSubmitBtn) confirmSubmitBtn.disabled = isBusy;
}

function buildBagPayload() {
    const flavorName = flavorNameInput ? flavorNameInput.value.trim() : DEFAULT_FLAVOR_NAME;
    const desc = flavorDescEl ? flavorDescEl.value.trim() : '';
    const payload = {
        name: flavorName || DEFAULT_FLAVOR_NAME,
        flavor: desc || flavorName || DEFAULT_FLAVOR_NAME,
        colour: getBagColor(),
        textColour: getTextColor(),
        font: bagFontSelect ? bagFontSelect.value : DEFAULT_FONT,
        bagImage: bagImageData || defaultImagePath,
    };
    if (currentUser && currentUser.id) {
        payload.creator = currentUser.id;
    }
    return payload;
}

async function submitBag() {
    if (!currentUser) {
        setLoginMessage('Please log in before posting.', true);
        if (submitModal) submitModal.classList.add('active');
        return;
    }
    setSubmitBusy(true);
    try {
        const payload = buildBagPayload();
        const headers = { 'Content-Type': 'application/json' };
        if (currentUser.token) headers.Authorization = `Bearer ${currentUser.token}`;

        const res = await fetch(BAG_SUBMIT_API, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const message = (data && (data.message || data.error)) || 'Submit failed';
            throw new Error(message);
        }
        if (submitModal) submitModal.classList.remove('active');
        window.dispatchEvent(new CustomEvent('bag-spinout'));
    } catch (err) {
        setLoginMessage(err.message || 'Submit failed', true);
        if (submitModal) submitModal.classList.add('active');
    } finally {
        setSubmitBusy(false);
    }
}