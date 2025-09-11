import * as THREE from "./lib/three.module.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { OrbitControls } from "./lib/OrbitControls.js";

// Cache global pour les modèles
const modelCache = new Map();
const loader = new GLTFLoader();

// Fonction pour créer une scène Three.js
function createScene(viewer) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    viewer.clientWidth / viewer.clientHeight,
    0.1,
    1000
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance", // Optimisation GPU
  });

  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limiter pixel ratio
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

  // Afficher un loader
  const loadingElement = document.createElement("div");
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
      <div id="progress-${viewer.dataset.model}" style="font-size: 12px;">0%</div>
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
      viewer.removeChild(loadingElement);

      // Setup du modèle
      setupModel(viewer, gltf.scene);

      console.log(`Modèle ${modelPath} chargé et mis en cache`);
    },
    (xhr) => {
      const progress = Math.round((xhr.loaded / xhr.total) * 100);
      const progressElement = document.getElementById(
        `progress-${viewer.dataset.model}`
      );
      if (progressElement) {
        progressElement.textContent = `${progress}%`;
      }
    },
    (error) => {
      console.error("Erreur de chargement :", error);
      viewer.removeChild(loadingElement);
    }
  );
}

// Fonction pour setup un modèle dans la scène
function setupModel(viewer, modelScene) {
  const { scene, camera, renderer } = createScene(viewer);

  const model = modelScene.clone();
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

  // Fonction d'animation optimisée
  function animate() {
    animationId = requestAnimationFrame(animate);

    if (isVisible) {
      controls.update();
      model.rotation.y += 0.005;
      renderer.render(scene, camera);
    }
  }

  // Redimensionnement optimisé avec debounce
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
    rootMargin: "50px", // Charger 50px avant d'être visible
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
    // Marquer comme chargé AVANT de charger
    firstViewer.dataset.loaded = "true";
    lazyLoadObserver.unobserve(firstViewer);

    setTimeout(() => {
      loadModel(firstViewer);
    }, 100);
  }
}
