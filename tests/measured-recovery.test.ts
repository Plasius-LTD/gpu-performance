import { describe, expect, it } from 'vitest';
import { createGpuPerformanceGovernor, createQualityLadderAdapter } from '../src/index.js';
import type { PerformanceAdjustmentContext } from '../src/index.js';

const context = (milliseconds: number): PerformanceAdjustmentContext => ({
  cycle: 1, cause: 'recover', pressureLevel: 'recovering', workerGraph: null,
  metrics: {sampleCount: 8, fps: 1000/milliseconds, latestFrameTimeMs: milliseconds,
    averageFrameTimeMs: milliseconds, emaFrameTimeMs: milliseconds, p95FrameTimeMs: milliseconds,
    targetFrameTimeMs: 1000/24, frameTimeDeltaMs: milliseconds-1000/24, trendDeltaMs: 0,
    dropRatio: 0, thermalState: 'nominal'},
  target: {mode:'flat',minimumFrameRate:24,targetFrameRate:24,targetFrameTimeMs:1000/24,
    downgradeFrameTimeMs:43.75,upgradeFrameTimeMs:38.33,candidateFrameRates:[24],rationale:[]},
});
const levels = [{id:'low',config:{}},{id:'high',config:{}}];
const hostTarget = {minimumFrameRate:24,maximumFrameRate:24,preferredFrameRates:[24],supportedFrameRates:[24],deviceRefreshRateHz:24};

describe('measured quality recovery',()=>{
  it('learns the cost ratio across a downgrade and retries only when new headroom fits',()=>{
    const adapter=createQualityLadderAdapter({id:'motion',domain:'resolution',levels,
      recoveryBudget:{headroomRatio:.9}});
    adapter.recordFrameTime(59);
    adapter.stepDown(context(59));
    adapter.recordFrameTime(35);
    expect(adapter.canStepUp(context(35))).toBe(false);
    expect(adapter.stepUp(context(35))).toBeNull();
    // Later faster execution must not overwrite the paired downgrade baseline.
    for(let i=0;i<100;i++)adapter.recordFrameTime(20);
    expect(adapter.canStepUp(context(20))).toBe(true);
    expect(adapter.stepUp(context(20))?.toLevelId).toBe('high');
  });
  it('permits discovery of unknown levels and keeps disabled behaviour',()=>{
    for(const recoveryBudget of [undefined,{headroomRatio:1}]){
      const adapter=createQualityLadderAdapter({id:'motion',domain:'resolution',levels,initialLevel:0,recoveryBudget});
      adapter.recordFrameTime(0);
      expect(adapter.stepUp(context(20))?.toLevelId).toBe('high');
      adapter.recordFrameTime(59);adapter.stepDown(context(59));adapter.recordFrameTime(35);
      if(!recoveryBudget)expect(adapter.stepUp(context(35))?.toLevelId).toBe('high');
    }
  });
  it('rejects invalid timing and headroom without mutating its level',()=>{
    for(const value of [0,-1,1.01,NaN,Infinity])expect(()=>createQualityLadderAdapter({id:'motion',domain:'resolution',levels,recoveryBudget:{headroomRatio:value}})).toThrow(/headroomRatio/);
    const adapter=createQualityLadderAdapter({id:'motion',domain:'resolution',levels,recoveryBudget:{headroomRatio:.9}});
    for(const value of [-1,NaN,Infinity])expect(()=>adapter.recordFrameTime(value)).toThrow(/frameTimeMs/);
    expect(adapter.getCurrentLevel().id).toBe('high');
  });
  it('retains blocked governor recovery while recovering another eligible module',()=>{
    let allow=false;
    const a=createQualityLadderAdapter({id:'a',domain:'resolution',levels});
    const b=createQualityLadderAdapter({id:'b',domain:'shadows',levels});
    const governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},
      target:hostTarget,modules:[a,{...b,canStepUp:()=>allow}],
      adaptation:{sampleWindowSize:1,minimumSamplesBeforeAdjustment:1,degradeCooldownFrames:1,
        upgradeCooldownFrames:1,minStableFramesForRecovery:1,maxStepChangesPerCycle:1,trendSensitivityMs:50}});
    for(let i=0;i<4;i++)governor.recordFrame({frameTimeMs:70});
    expect(a.getCurrentLevel().id).toBe('low');expect(b.getCurrentLevel().id).toBe('low');
    for(let i=0;i<8;i++)governor.recordFrame({frameTimeMs:10});
    expect(a.getCurrentLevel().id).toBe('high');expect(b.getCurrentLevel().id).toBe('low');
    allow=true;
    for(let i=0;i<8;i++)governor.recordFrame({frameTimeMs:10});
    expect(b.getCurrentLevel().id).toBe('high');
  });
});

it('relearns changed upper costs and ignores zero lower-level durations',()=>{
 const adapter=createQualityLadderAdapter({id:'quality',domain:'custom',levels,recoveryBudget:{headroomRatio:1}});
 adapter.recordFrameTime(60);adapter.stepDown(context(60));adapter.recordFrameTime(0);
 adapter.recordFrameTime(30);expect(adapter.canStepUp(context(30))).toBe(false);
 adapter.stepUp(context(10));adapter.recordFrameTime(18);adapter.stepDown(context(18));adapter.recordFrameTime(12);
 expect(adapter.stepUp(context(20))?.toLevelId).toBe('high');
 expect(adapter.stepUp(context(20))).toBeNull();
 expect(adapter.stepDown(context(20))?.toLevelId).toBe('low');
 expect(adapter.stepDown(context(20))).toBeNull();
});
it('retains the existing64-level bound and rejects malformed recovery options',()=>{
 const many=Array.from({length:64},(_,i)=>({id:`level-${i}`,config:{}}));
 expect(createQualityLadderAdapter({id:'bounded',domain:'custom',levels:many,recoveryBudget:{headroomRatio:1}}).getSnapshot().levelCount).toBe(64);
 expect(()=>createQualityLadderAdapter({id:'too-many',domain:'custom',levels:[...many,{id:'extra',config:{}}]})).toThrow(/64/);
 for(const recoveryBudget of [null,{}, {headroomRatio:'1'}]){
  // Invalid JavaScript callers must fail before an adapter is returned.
  expect(()=>createQualityLadderAdapter({id:'invalid',domain:'custom',levels,recoveryBudget:recoveryBudget as any})).toThrow(/headroomRatio/);
 }
 const adapter=createQualityLadderAdapter({id:'timing',domain:'custom',levels});
 expect(()=>adapter.recordFrameTime(undefined as any)).toThrow(/frameTimeMs/);
});
it('isolates a throwing recovery hook without blocking remaining modules',()=>{
 const a=createQualityLadderAdapter({id:'a',domain:'resolution',levels});
 const b=createQualityLadderAdapter({id:'b',domain:'shadows',levels});
 const governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},target:hostTarget,
  modules:[a,{...b,canStepUp(){throw new Error('unavailable');}}],adaptation:{sampleWindowSize:1,minimumSamplesBeforeAdjustment:1,degradeCooldownFrames:1,upgradeCooldownFrames:1,minStableFramesForRecovery:1,maxStepChangesPerCycle:1}});
 for(let i=0;i<4;i++)governor.recordFrame({frameTimeMs:70});
 for(let i=0;i<10;i++)governor.recordFrame({frameTimeMs:10});
 expect(a.getCurrentLevel().id).toBe('high');expect(b.getCurrentLevel().id).toBe('low');
 expect(governor.getState().recentErrors.some(e=>e.code==='MODULE_STEP_UP_FAILED')).toBe(true);
});
it('propagates host execution headroom through the governor before rising load misses cadence',()=>{
 const adapter=createQualityLadderAdapter({id:'quality',domain:'resolution',levels});
 const governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},modules:[adapter],
  target:{...hostTarget,frameBudgetRatio:.9},
  adaptation:{sampleWindowSize:8,minimumSamplesBeforeAdjustment:4,degradeCooldownFrames:2,trendSensitivityMs:1000/24}});
 expect(governor.getTarget().downgradeFrameTimeMs).toBeCloseTo(37.5);
 for(let frameTimeMs=30;frameTimeMs<41;frameTimeMs+=.25)governor.recordFrame({frameTimeMs});
 expect(adapter.getCurrentLevel().id).toBe('low');
});
