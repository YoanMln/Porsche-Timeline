import * as THREE from "./lib/three.module.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { OrbitControls } from "./lib/OrbitControls.js";

// Gestion des erreurs globales
window.addEventListener("error", (event) => {
  console.error("Erreur globale:", event.error);
  if (event.error && event.error.message.includes("out of memory")) {
    console.error(" ERREUR MÉMOIRE DÉTECTÉE - Nettoyage d'urgence");
    // Nettoyer toutes les instances
    activeInstances.forEach((instance, viewer) => {
      cleanupInstance(viewer);
    });
  }
});

window.addEventListener(
  "webglcontextlost",
  (event) => {
    console.error(" CONTEXTE WEBGL PERDU");
    event.preventDefault();

    activeInstances.forEach((instance, viewer) => {
      cleanupInstance(viewer);
    });
  },
  false
);

// Cache global pour les modèles
const modelCache = new Map();
const loader = new GLTFLoader();

// Tracking de toutes les instances pour cleanup
const activeInstances = new Map();

function isMobile() {
  const userAgent = navigator.userAgent;
  const isMobileDevice =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );
  const isSmallScreen = window.innerWidth <= 768;
  const isLowMemory = navigator.deviceMemory && navigator.deviceMemory < 4;

  return isMobileDevice || isSmallScreen || isLowMemory;
}

function disposeObject3D(obj) {
  if (!obj) return;

  if (obj.geometry && !obj.geometry.userData.isShared) {
    obj.geometry.dispose();
  }

  if (obj.material) {
    if (Array.isArray(obj.material)) {
      obj.material.forEach((material) => disposeMaterial(material));
    } else {
      disposeMaterial(obj.material);
    }
  }

  if (obj.children) {
    while (obj.children.length > 0) {
      disposeObject3D(obj.children[0]);
      obj.remove(obj.children[0]);
    }
  }
}

function disposeMaterial(material) {
  if (!material || material.userData.isShared) return;

  // Disposer toutes les textures (sauf partagées)
  Object.keys(material).forEach((key) => {
    if (
      material[key] &&
      material[key].isTexture &&
      !material[key].userData.isShared
    ) {
      material[key].dispose();
    }
  });

  material.dispose();
}

// Fonction pour nettoyer complètement une instance
function cleanupInstance(viewer) {
  const instance = activeInstances.get(viewer);
  if (!instance) return;

  console.log(` Nettoyage de ${viewer.dataset.model}`);

  // Arrêter l'animation
  if (instance.animationId) {
    cancelAnimationFrame(instance.animationId);
    instance.animationId = null;
  }

  // Retirer le handler resize
  if (instance.resizeHandler) {
    window.removeEventListener("resize", instance.resizeHandler);
  }

  // Déconnecter les observers
  if (instance.visibilityObserver) {
    instance.visibilityObserver.disconnect();
  }

  // Disposer des contrôles
  if (instance.controls) {
    instance.controls.dispose();
  }

  // Disposer du modèle
  if (instance.model) {
    disposeObject3D(instance.model);
  }

  // Nettoyer la scène
  if (instance.scene) {
    while (instance.scene.children.length > 0) {
      const child = instance.scene.children[0];
      disposeObject3D(child);
      instance.scene.remove(child);
    }
  }

  // Disposer du renderer
  if (instance.renderer) {
    instance.renderer.dispose();
    instance.renderer.forceContextLoss();
    if (
      instance.renderer.domElement &&
      instance.renderer.domElement.parentNode === viewer
    ) {
      viewer.removeChild(instance.renderer.domElement);
    }
  }

  // Retirer du tracking
  activeInstances.delete(viewer);

  if (window.gc) {
    window.gc();
  }

  console.log(` Instance nettoyée. Instances actives: ${activeInstances.size}`);
}

function createScene(viewer) {
  if (activeInstances.has(viewer)) {
    cleanupInstance(viewer);
  }

  if (isMobile() && activeInstances.size >= MAX_ACTIVE_INSTANCES) {
    const oldestViewer = Array.from(activeInstances.keys())[0];
    console.log(` Limite atteinte, nettoyage de l'instance la plus ancienne`);
    cleanupInstance(oldestViewer);
  }

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    viewer.clientWidth / viewer.clientHeight,
    0.1,
    1000
  );

  const rendererConfig = {
    alpha: true,
    stencil: false,
    depth: true,
    logarithmicDepthBuffer: false,
  };

  if (isMobile()) {
    rendererConfig.antialias = false;
    rendererConfig.powerPreference = "low-power";
    rendererConfig.precision = "lowp";
    rendererConfig.preserveDrawingBuffer = false;
  } else {
    rendererConfig.antialias = true;
    rendererConfig.powerPreference = "default";
    rendererConfig.precision = "mediump";
  }

  const renderer = new THREE.WebGLRenderer(rendererConfig);

  let renderWidth = viewer.clientWidth;
  let renderHeight = viewer.clientHeight;

  if (isMobile()) {
    const maxSize = 300;
    if (renderWidth > maxSize) {
      const scale = maxSize / renderWidth;
      renderWidth = maxSize;
      renderHeight = renderHeight * scale;
    }
  }

  renderer.setSize(renderWidth, renderHeight);
  renderer.setClearColor(0x000000, 0);

  const pixelRatio = isMobile() ? 0.75 : Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);

  if (
    isMobile() &&
    (renderWidth !== viewer.clientWidth || renderHeight !== viewer.clientHeight)
  ) {
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.objectFit = "contain";
  }

  viewer.appendChild(renderer.domElement);

  if (isMobile()) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(ambientLight, directionalLight);
  } else {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 7.5);
    const pointLight = new THREE.PointLight(0xffffff, 0.7);
    pointLight.position.set(0, 10, 10);
    scene.add(ambientLight, directionalLight, pointLight);
  }

  return { scene, camera, renderer };
}

function markSharedResources(model) {
  model.traverse((node) => {
    if (node.isMesh) {
      if (node.geometry) {
        node.geometry.userData.isShared = true;
      }
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach((mat) => {
            mat.userData.isShared = true;
            Object.keys(mat).forEach((key) => {
              if (mat[key] && mat[key].isTexture) {
                mat[key].userData.isShared = true;
              }
            });
          });
        } else {
          node.material.userData.isShared = true;
          Object.keys(node.material).forEach((key) => {
            if (node.material[key] && node.material[key].isTexture) {
              node.material[key].userData.isShared = true;
            }
          });
        }
      }
    }
  });
}

function loadModel(viewer) {
  const modelPath = viewer.dataset.model;

  if (modelCache.has(modelPath)) {
    const cachedModel = modelCache.get(modelPath);
    setupModel(viewer, cachedModel);
    return;
  }

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

  loader.load(
    modelPath,
    (gltf) => {
      try {
        if (isMobile()) {
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              if (child.material) {
                child.material.flatShading = true;
                child.material.needsUpdate = true;

                if (child.material.map) {
                  child.material.map.minFilter = THREE.LinearFilter;
                  child.material.map.magFilter = THREE.LinearFilter;
                  child.material.map.generateMipmaps = false;
                }

                // Désactiver les maps inutiles sur mobile
                child.material.normalMap = null;
                child.material.roughnessMap = null;
                child.material.metalnessMap = null;
              }
            }
          });
        }

        // Marquer les ressources comme partagées
        markSharedResources(gltf.scene);

        // Mettre en cache
        modelCache.set(modelPath, gltf.scene);

        // Supprimer le loader
        if (viewer.contains(loadingElement)) {
          viewer.removeChild(loadingElement);
        }

        setupModel(viewer, gltf.scene);

        console.log(` Modèle ${modelPath} chargé et mis en cache`);
      } catch (error) {
        console.error(" Erreur lors du setup du modèle:", error);
        if (viewer.contains(loadingElement)) {
          viewer.removeChild(loadingElement);
        }
      }
    },
    (xhr) => {
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

function setupModel(viewer, modelScene) {
  const { scene, camera, renderer } = createScene(viewer);

  const model = modelScene.clone();
  scene.add(model);

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
          const wasVisible = isVisible;
          isVisible = entry.isIntersecting;

          if (isVisible && !animationId) {
            console.log(`👁️ Viewer visible: ${viewer.dataset.model}`);
            animate();
          } else if (!isVisible && animationId) {
            console.log(`🙈 Viewer invisible: ${viewer.dataset.model}`);
            cancelAnimationFrame(animationId);
            animationId = null;

            // Sur mobile, nettoyer après 2 secondes hors écran
            if (isMobile() && wasVisible) {
              setTimeout(() => {
                if (!isVisible) {
                  console.log(`🗑️ Nettoyage du viewer hors écran`);
                  cleanupInstance(viewer);
                }
              }, 2000);
            }
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
      model.rotation.y += isMobile() ? 0.002 : 0.005;
      renderer.render(scene, camera);
    }
  }

  // Stocker l'instance pour cleanup
  activeInstances.set(viewer, {
    scene,
    camera,
    renderer,
    controls,
    model,
    animationId,
    visibilityObserver,
  });

  // Gestion du resize avec debounce
  let resizeTimeout;
  const handleResize = () => {
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
  };

  window.addEventListener("resize", handleResize);

  activeInstances.get(viewer).resizeHandler = handleResize;
}

window.addEventListener("beforeunload", () => {
  activeInstances.forEach((instance, viewer) => {
    cleanupInstance(viewer);
  });
});

const mutationObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.removedNodes.forEach((node) => {
      if (node.classList && node.classList.contains("viewer")) {
        cleanupInstance(node);
      }
    });
  });
});

mutationObserver.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initialisation
const viewers = document.querySelectorAll(".viewer");

const maxViewersToLoad = isMobile() ? 3 : viewers.length;

const lazyLoadObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !entry.target.dataset.loaded) {
        const loadedCount = Array.from(viewers).filter(
          (v) => v.dataset.loaded
        ).length;
        if (isMobile() && loadedCount >= maxViewersToLoad) {
          console.log(` Limite de viewers atteinte sur mobile`);
          return;
        }

        loadModel(entry.target);
        entry.target.dataset.loaded = "true";
        lazyLoadObserver.unobserve(entry.target);
      }
    });
  },
  {
    rootMargin: "50px",
  }
);

viewers.forEach((viewer) => {
  lazyLoadObserver.observe(viewer);
});

// Charger le premier modèle immédiatement
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
