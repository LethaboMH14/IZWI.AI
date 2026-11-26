export type SceneConditions = { webgl: boolean; reducedMotion: boolean; saveData: boolean; width: number; staticPreference: boolean; contextFailed: boolean };
export function shouldUseStaticScene(c: SceneConditions): boolean { return !c.webgl || c.reducedMotion || c.saveData || c.width <= 767 || c.staticPreference || c.contextFailed; }
export function browserSceneConditions(contextFailed = false): SceneConditions {
 let webgl = false, staticPreference = false;
 try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); webgl = !!gl; gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* static */ }
 try { staticPreference = localStorage.getItem('izwi:staticScene') === '1'; } catch { /* storage may be unavailable */ }
 return { webgl, staticPreference, contextFailed, width: window.innerWidth, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, saveData: !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData };
}
