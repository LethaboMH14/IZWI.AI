import { describe, it, expect } from 'vitest';
import { shouldUseStaticScene, type SceneConditions } from '../src/lib/gpu-tier';
const capable: SceneConditions = { webgl:true, reducedMotion:false, saveData:false, width:1024, staticPreference:false, contextFailed:false };
describe('scene eligibility', () => {
 it('allows a capable desktop', () => expect(shouldUseStaticScene(capable)).toBe(false));
 it.each([{webgl:false},{reducedMotion:true},{saveData:true},{width:767},{staticPreference:true},{contextFailed:true}])('falls back for %o', change => expect(shouldUseStaticScene({...capable,...change})).toBe(true));
 it('allows the first desktop pixel', () => expect(shouldUseStaticScene({...capable,width:768})).toBe(false));
});
