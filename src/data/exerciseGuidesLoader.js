let guidesModule = null;
let guidesPromise = null;

export function getCachedExerciseGuides() {
  return guidesModule;
}

export function loadExerciseGuides() {
  if (guidesModule) return Promise.resolve(guidesModule);
  if (!guidesPromise) {
    guidesPromise = import('./exerciseGuides.js').then(module => {
      guidesModule = module;
      return module;
    }).catch(error => {
      guidesPromise = null;
      throw error;
    });
  }
  return guidesPromise;
}
