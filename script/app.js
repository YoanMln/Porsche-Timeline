import * as THREE from "./lib/three.module.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { OrbitControls } from "./lib/OrbitControls.js";

// Cache global pour les modèles
const modelCache = new Map();
const loader = new GLTFLoader();

// Fonction pour détecter mobile
function isMobile() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth <= 768
  );
}

// Fonction pour créer une scène Three.js
function createScene(viewer) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    viewer.clientWidth / viewer.clientHeight,
    0.1,
    1000
  );

  // Configuration renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: !isMobile(),
    alpha: true,
    powerPreference: "default",
    precision: "mediump",
    stencil: false,
    depth: true,
    logarithmicDepthBuffer: false,
  });

  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  // Limite la taille du renderer sur mobile
  const maxSize = isMobile() ? 512 : 1024;
  if (viewer.clientWidth > maxSize || viewer.clientHeight > maxSize) {
    const scale = Math.min(
      maxSize / viewer.clientWidth,
      maxSize / viewer.clientHeight
    );
    renderer.setSize(viewer.clientWidth * scale, viewer.clientHeight * scale);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
  }

  viewer.appendChild(renderer.domElement);

  // Lumières optimisées
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(5, 10, 7.5);
  const pointLight = new THREE.PointLight(0xffffff, 0.7);
  pointLight.position.set(0, 10, 10);

  scene.add(ambientLight, directionalLight, pointLight);

  return { scene, camera, renderer };
}

// Fonction pour charger un modèle avec cache
function loadModel(viewer) {
  const modelPath = viewer.dataset.model;

  // Vérifier le cache
  if (modelCache.has(modelPath)) {
    const cachedModel = modelCache.get(modelPath).clone();
    setupModel(viewer, cachedModel);
    return;
  }

  // Afficher un loader avec ID unique
  const loadingElement = document.createElement("div");
  const loaderId = `progress-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  loadingElement.innerHTML = `
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #ad856f;
      font-family: Inter;
      font-size: 14px;
      text-align: center;
    ">
      <div style="margin-bottom: 10px;">Chargement 3D...</div>
      <div id="${loaderId}" style="font-size: 12px;">0%</div>
    </div>
  `;
  viewer.appendChild(loadingElement);

  // Charger le modèle
  loader.load(
    modelPath,
    (gltf) => {
      // Mettre en cache
      modelCache.set(modelPath, gltf.scene);

      // Supprimer le loader
      if (viewer.contains(loadingElement)) {
        viewer.removeChild(loadingElement);
      }

      // Setup du modèle
      setupModel(viewer, gltf.scene);

      console.log(`Modèle ${modelPath} chargé et mis en cache`);
    },
    (xhr) => {
      // Calcul du pourcentage
      if (xhr.lengthComputable && xhr.total > 0) {
        const progress = Math.min(
          Math.max(Math.round((xhr.loaded / xhr.total) * 100), 0),
          100
        );
        const progressElement = document.getElementById(loaderId);
        if (progressElement) {
          progressElement.textContent = `${progress}%`;
        }
      }
    },
    (error) => {
      console.error("Erreur de chargement :", error);
      if (viewer.contains(loadingElement)) {
        viewer.removeChild(loadingElement);
      }
    }
  );
}

// Fonction pour setup un modèle dans la scène
function setupModel(viewer, modelScene) {
  const { scene, camera, renderer } = createScene(viewer);

  const model = modelScene.clone();

  // Réduire la qualité sur mobile
  if (isMobile()) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.material.wireframe = false;
        if (child.material.map) {
          child.material.map.minFilter = THREE.LinearFilter;
          child.material.map.magFilter = THREE.LinearFilter;
        }
      }
    });
  }

  scene.add(model);

  // Calculer la boîte englobante
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Centrer le modèle
  model.position.sub(center);
  model.scale.setScalar(1.5);

  // Positionner la caméra
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  cameraZ *= 2;

  camera.position.set(0, 0, cameraZ);
  camera.lookAt(0, 0, 0);

  // Contrôles
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Variables pour le rendu conditionnel
  let isVisible = false;
  let animationId = null;

  // Observer la visibilité du viewer
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target === viewer) {
          isVisible = entry.isIntersecting;

          if (isVisible && !animationId) {
            // Démarrer l'animation quand visible
            animate();
          } else if (!isVisible && animationId) {
            // Arrêter l'animation quand invisible
            cancelAnimationFrame(animationId);
            animationId = null;
          }
        }
      });
    },
    { threshold: 0.1 }
  );

  visibilityObserver.observe(viewer);

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (isVisible) {
      controls.update();

      model.rotation.y += isMobile() ? 0.003 : 0.005;
      renderer.render(scene, camera);
    }
  }

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const width = viewer.clientWidth;
      const height = viewer.clientHeight;

      if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    }, 100);
  });

  // Nettoyage mémoire au déchargement
  window.addEventListener("beforeunload", () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    controls.dispose();
    renderer.dispose();
    visibilityObserver.disconnect();
  });
}

// Lazy Loading avec Intersection Observer
const viewers = document.querySelectorAll(".viewer");

const lazyLoadObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !entry.target.dataset.loaded) {
        loadModel(entry.target);
        entry.target.dataset.loaded = "true";
        // Arrêter d'observer ce viewer
        lazyLoadObserver.unobserve(entry.target);
      }
    });
  },
  {
    rootMargin: "50px",
  }
);

// Observer tous les viewers
viewers.forEach((viewer) => {
  lazyLoadObserver.observe(viewer);
});

// Précharger le premier modèle visible immédiatement
if (viewers.length > 0) {
  const firstViewer = viewers[0];
  if (firstViewer.dataset.model && !firstViewer.dataset.loaded) {
    firstViewer.dataset.loaded = "true";
    lazyLoadObserver.unobserve(firstViewer);

    setTimeout(() => {
      loadModel(firstViewer);
    }, 100);
  }
}
