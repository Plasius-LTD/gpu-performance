import { describe, expect, it } from 'vitest';
import {
  normalizeWavefrontRefinementPolicy as normalize,
  planWavefrontRefinement as plan,
  wavefrontRefinementImportance as importance,
} from '../src/index.js';

describe('coverage-first refinement policy', () => {
  it('disabled never reads unused settings or frame inputs', () => {
    const off=normalize({get movingMaximumSamplesPerPixel():number{throw Error('unused');}});
    expect(off.enabled).toBe(false);
    expect(plan(off, {get moving(){throw Error('unused');}} as never)).toBeNull();
  });
  it('snapshots configurable targets/focus without changing the sequence period', () => {
    const focus:[number,number]=[.4,.6];
    const p=normalize({enabled:true,foveation:{enabled:true,focusPointUv:focus}});
    focus[0]=0;
    expect(p.sequencePeriodSamplesPerPixel).toBe(256);
    expect(p.movingMaximumSamplesPerPixel).toBe(32);
    expect(p.foveation.focusPointUv).toEqual([.4,.6]);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.foveation.focusPointUv)).toBe(true);
  });
  it('requires a real one-SPP preview before focus or stationary extras', () => {
    const p=normalize({enabled:true,stationaryRefinement:true,foveation:{enabled:true}});
    for(const moving of [false,true]){
      const r=plan(p,{moving,previewComplete:false})!;
      expect(r.phase).toBe('coverage');expect(r.maximumSamplesPerPixel).toBe(1);
      expect(r.focusImportanceActive).toBe(false);expect(r.minimumCoverageRequired).toBe(true);
    }
  });
  it('motion consumes the existing ceiling while stationary catches up every edge', () => {
    const p=normalize({enabled:true,stationaryRefinement:true,foveation:{enabled:true}});
    const moving=plan(p,{moving:true,previewComplete:true,effectiveSamplesPerPixel:8})!;
    expect(moving.phase).toBe('focus');expect(moving.maximumSamplesPerPixel).toBe(8);
    expect(moving.focusImportanceActive).toBe(true);expect(moving.globalCatchUp).toBe(false);
    const still=plan(p,{moving:false,previewComplete:true,effectiveSamplesPerPixel:1})!;
    expect(still.phase).toBe('stationary');expect(still.maximumSamplesPerPixel).toBe(256);
    expect(still.globalCatchUp).toBe(true);expect(still.focusImportanceActive).toBe(false);
    expect(still.sequencePeriodSamplesPerPixel).toBe(moving.sequencePeriodSamplesPerPixel);
  });
  it('stationary child off retains bounded focus targets', () => {
    const p=normalize({enabled:true,movingMaximumSamplesPerPixel:16,maximumSamplesPerPixel:128});
    const r=plan(p,{moving:false,previewComplete:true})!;
    expect(r.phase).toBe('focus');expect(r.maximumSamplesPerPixel).toBe(16);
    expect(r.globalCatchUp).toBe(false);expect(r.sequencePeriodSamplesPerPixel).toBe(128);
  });
  it('zero/omitted budget disables reduction, with no hidden target', () => {
    const p=normalize({enabled:true,performanceBudget:true,maximumWorkUnitsPerBatch:12});
    for(const frameTimeBudgetMs of [undefined,0]){
      const r=plan(p,{moving:true,previewComplete:true,frameTimeBudgetMs})!;
      expect(r.maximumWorkUnits).toBe(12);expect(r.budgetReason).toBe('budget-disabled');
    }
  });
  it('budget child off ignores optional cost fields', () => {
    const p=normalize({enabled:true});
    const r=plan(p,{moving:true,previewComplete:true,get estimatedWorkUnitMs():number{throw Error('unused');}})!;
    expect(r.budgetReason).toBe('budget-disabled');
  });
  it('unknown cost bootstraps one unit; optional moving work stops if none fits', () => {
    const p=normalize({enabled:true,performanceBudget:true});
    expect(plan(p,{moving:true,previewComplete:false,frameTimeBudgetMs:16})!.maximumWorkUnits).toBe(1);
    const r=plan(p,{moving:true,previewComplete:true,frameTimeBudgetMs:16,estimatedWorkUnitMs:20})!;
    expect(r.maximumWorkUnits).toBe(0);expect(r.budgetReason).toBe('no-optional-budget');
  });
  it('mandatory coverage and stationary progress report an indivisible overrun', () => {
    const p=normalize({enabled:true,performanceBudget:true,stationaryRefinement:true});
    for(const input of [{moving:true,previewComplete:false},{moving:false,previewComplete:true}]){
      const r=plan(p,{...input,frameTimeBudgetMs:16,estimatedWorkUnitMs:20})!;
      expect(r.maximumWorkUnits).toBe(1);expect(r.budgetReason).toBe('minimum-work-unit-over-budget');
    }
  });
  it('admits only prior-cost work that fits the remaining budget', () => {
    const p=normalize({enabled:true,performanceBudget:true,maximumWorkUnitsPerBatch:10});
    const r=plan(p,{moving:true,previewComplete:true,frameTimeBudgetMs:16.67,spentFrameTimeMs:5,estimatedWorkUnitMs:4})!;
    expect(r.maximumWorkUnits).toBe(2);expect(r.estimatedWorkMs).toBe(8);
    expect(r.maximumSamplesPerPixel).toBe(32);expect(r.sequencePeriodSamplesPerPixel).toBe(256);
  });
  it('uses aspect-correct focus and a configurable peripheral importance', () => {
    const p=normalize({enabled:true,foveation:{enabled:true,innerRadius:.1,outerRadius:.3,edgeImportance:.2}});
    expect(importance(p,[.5,.5],2)).toBe(1);
    expect(importance(p,[0,0],2)).toBe(.2);
    expect(importance(p,[.6,.5],2)).toBeCloseTo(importance(p,[.5,.7],2),12);
    expect(importance(normalize({enabled:true}),[0,0],1)).toBe(1);
  });
  it('rejects invalid counts, flags, focus, frame state and cost', () => {
    for(const v of [0,257,NaN,Infinity,1.5])expect(()=>normalize({enabled:true,maximumSamplesPerPixel:v})).toThrow();
    expect(()=>normalize({enabled:true,movingMaximumSamplesPerPixel:64,maximumSamplesPerPixel:32})).toThrow();
    expect(()=>normalize({enabled:true,performanceBudget:'true' as never})).toThrow();
    expect(()=>normalize({enabled:true,foveation:{enabled:true,innerRadius:.5,outerRadius:.1}})).toThrow();
    const p=normalize({enabled:true,performanceBudget:true});
    for(const frameTimeBudgetMs of [-1,NaN,Infinity])expect(()=>plan(p,{moving:true,previewComplete:true,frameTimeBudgetMs})).toThrow();
    for(const estimatedWorkUnitMs of [0,-1,Infinity])expect(()=>plan(p,{moving:true,previewComplete:true,frameTimeBudgetMs:16,estimatedWorkUnitMs})).toThrow();
    expect(()=>importance(p,[NaN,0],1)).toThrow();
    expect(()=>importance(p,[0,0],0)).toThrow();
  });
});
