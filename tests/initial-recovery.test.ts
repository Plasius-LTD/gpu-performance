import { expect, it } from 'vitest';
import { createGpuPerformanceGovernor, createQualityLadderAdapter } from '../src/index.js';

const levels=[{id:'low',config:{}},{id:'medium',config:{}},{id:'high',config:{}}];
const target={minimumFrameRate:24,maximumFrameRate:24,preferredFrameRates:[24],supportedFrameRates:[24],deviceRefreshRateHz:24};
const adaptation={sampleWindowSize:1,minimumSamplesBeforeAdjustment:1,upgradeCooldownFrames:1,minStableFramesForRecovery:1,degradeCooldownFrames:1,trendSensitivityMs:50};
const make=(id='motion')=>createQualityLadderAdapter({id,domain:'resolution',levels,initialLevel:0,
  recoveryBudget:{headroomRatio:.7,initialCostRatios:[2,2]}});
const feed=(governor:ReturnType<typeof createGpuPerformanceGovernor>,adapter:ReturnType<typeof make>,ms:number)=>{
  for(let i=0;i<30;i++){adapter.recordFrameTime(ms);governor.recordFrame({frameTimeMs:ms});}
};

it('opts into cold-start recovery without inventing frame samples or changing the default',()=>{
  for(const recoverInitialLevels of [undefined,false,true]) {
    const adapter=make(),governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},target,adaptation,modules:[adapter],recoverInitialLevels});
    expect(governor.getState().cycle).toBe(0);
    feed(governor,adapter,5);
    expect(adapter.getCurrentLevel().id).toBe(recoverInitialLevels?'high':'low');
    expect(governor.getState().cycle).toBe(30);
  }
});
it('retains a predicted over-budget upgrade and permits it after real execution improves',()=>{
  const adapter=make(),governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},target,adaptation,modules:[adapter],recoverInitialLevels:true});
  feed(governor,adapter,20);
  expect(adapter.getCurrentLevel().id).toBe('low');
  feed(governor,adapter,5);
  expect(adapter.getCurrentLevel().id).toBe('high');
});
it('handles initial recovery across registration, removal, reset and maximum-level exhaustion',()=>{
  const adapter=make(),governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},target,adaptation,recoverInitialLevels:true});
  const unregister=governor.registerModule(adapter);unregister();
  feed(governor,adapter,5);expect(adapter.getCurrentLevel().id).toBe('low');
  governor.registerModule(adapter);governor.reset();feed(governor,adapter,5);
  expect(adapter.getCurrentLevel().id).toBe('high');
  governor.reset();feed(governor,adapter,5);expect(governor.getState().recentErrors).toEqual([]);
});
it('does not change authoritative initial quality unless explicitly allowed',()=>{
  const adapter=createQualityLadderAdapter({id:'physics',domain:'custom',authority:'authoritative',levels,initialLevel:0});
  const governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},target,adaptation,modules:[adapter],recoverInitialLevels:true});
  for(let i=0;i<30;i++)governor.recordFrame({frameTimeMs:5});
  expect(adapter.getCurrentLevel().id).toBe('low');
});
it('validates and copies initial cost ratios before recording telemetry',()=>{
  for(const initialCostRatios of [null,{},[],[2],[2,0],[NaN,2],[Infinity,2],['2',2],[2,2,2]]) {
    expect(()=>createQualityLadderAdapter({id:'motion',domain:'custom',levels,recoveryBudget:{headroomRatio:.7,initialCostRatios:initialCostRatios as never}})).toThrow(/initialCostRatios/);
  }
  const ratios=[2,2],adapter=createQualityLadderAdapter({id:'motion',domain:'custom',levels,initialLevel:0,recoveryBudget:{headroomRatio:.7,initialCostRatios:ratios}});
  ratios[0]=.01;
  const governor=createGpuPerformanceGovernor({device:{supportsWebGpu:true},target,adaptation,modules:[adapter],recoverInitialLevels:true});
  feed(governor,adapter,20);expect(adapter.getCurrentLevel().id).toBe('low');
  expect(()=>createGpuPerformanceGovernor({device:{supportsWebGpu:true},recoverInitialLevels:1 as never})).toThrow(/recoverInitialLevels/);
});

it('isolates a failing startup admission and continues recovery of healthy modules', () => {
  const bad = make('bad'), healthy = make('healthy');
  let attempts = 0;
  const governor = createGpuPerformanceGovernor({
    device: { supportsWebGpu: true }, target, adaptation, recoverInitialLevels: true,
    modules: [{ ...bad, canStepUp() { attempts++; throw new Error('adapter failed'); } }, healthy],
  });
  feed(governor, healthy, 5);
  expect(attempts).toBe(1);
  expect(healthy.getCurrentLevel().id).toBe('high');
  expect(governor.getState().recentErrors.length).toBeGreaterThan(0);
});

it('permits authoritative startup recovery only with the explicit existing opt-in', () => {
  const adapter = createQualityLadderAdapter({ id: 'physics', domain: 'custom', authority: 'authoritative', levels, initialLevel: 0 });
  const governor = createGpuPerformanceGovernor({ device: { supportsWebGpu: true }, target,
    adaptation: { ...adaptation, allowAuthoritativeScaling: true }, modules: [adapter], recoverInitialLevels: true });
  for (let i = 0; i < 30; i++) governor.recordFrame({ frameTimeMs: 5 });
  expect(adapter.getCurrentLevel().id).toBe('high');
});
