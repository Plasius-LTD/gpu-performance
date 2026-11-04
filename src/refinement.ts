import { normalizeWavefrontAdaptiveBudgetPolicy } from './adaptive.js';

/** Caller resolves the existing remote flags; this module adds no control loop. */
export interface WavefrontRefinementOptions {
  readonly enabled?: boolean;
  readonly maximumSamplesPerPixel?: number;
  readonly movingMaximumSamplesPerPixel?: number;
  readonly maximumWorkUnitsPerBatch?: number;
  readonly stationaryRefinement?: boolean;
  readonly performanceBudget?: boolean;
  readonly foveation?: {
    readonly enabled?: boolean;
    readonly focusPointUv?: readonly [number, number];
    readonly innerRadius?: number;
    readonly outerRadius?: number;
    readonly edgeImportance?: number;
  };
}

/** Immutable policy; the sequence period never depends on admitted work. */
export interface WavefrontRefinementPolicy {
  readonly enabled: boolean;
  readonly maximumSamplesPerPixel: number;
  readonly movingMaximumSamplesPerPixel: number;
  readonly sequencePeriodSamplesPerPixel: number;
  readonly maximumWorkUnitsPerBatch: number;
  readonly stationaryRefinement: boolean;
  readonly performanceBudget: boolean;
  readonly foveation: {
    readonly enabled: boolean;
    readonly focusPointUv: readonly [number, number];
    readonly innerRadius: number;
    readonly outerRadius: number;
    readonly edgeImportance: number;
  };
}

/** Negotiated budget and prior completed cost, supplied by existing adapters. */
export interface WavefrontRefinementInput {
  readonly moving: boolean;
  readonly previewComplete: boolean;
  readonly effectiveSamplesPerPixel?: number;
  readonly frameTimeBudgetMs?: number;
  readonly spentFrameTimeMs?: number;
  readonly estimatedWorkUnitMs?: number;
}

export interface WavefrontRefinementPlan {
  readonly phase: 'coverage' | 'focus' | 'stationary';
  readonly minimumCoverageRequired: boolean;
  readonly minimumSamplesPerPixel: 1;
  readonly maximumSamplesPerPixel: number;
  readonly sequencePeriodSamplesPerPixel: number;
  readonly tiers: readonly number[];
  readonly focusImportanceActive: boolean;
  readonly globalCatchUp: boolean;
  readonly maximumWorkUnits: number;
  readonly canRun: boolean;
  readonly estimatedWorkMs: number | null;
  readonly budgetReason: 'budget-disabled' | 'uncalibrated' | 'within-budget'
    | 'no-optional-budget' | 'minimum-work-unit-over-budget';
}

const defaults: WavefrontRefinementPolicy = Object.freeze({
  enabled: false, maximumSamplesPerPixel: 256, movingMaximumSamplesPerPixel: 32,
  sequencePeriodSamplesPerPixel: 256, maximumWorkUnitsPerBatch: 16,
  stationaryRefinement: false, performanceBudget: false,
  foveation: Object.freeze({enabled:false,
    focusPointUv:Object.freeze([.5,.5]) as readonly [number,number],
    innerRadius:.15,outerRadius:.75,edgeImportance:0}),
});

function bool(name:string,value:unknown):boolean {
  if(value!==undefined&&typeof value!=='boolean')throw new TypeError(`${name} must be boolean.`);
  return value===true;
}
function finite(name:string,value:number,min=0):number {
  if(!Number.isFinite(value)||value<min)throw new RangeError(`${name} must be finite and >= ${min}.`);
  return value;
}
function integer(name:string,value:number,max:number):number {
  if(!Number.isSafeInteger(value)||value<1||value>max)throw new RangeError(`${name} must be an integer in 1..${max}.`);
  return value;
}
function plain(name:string,value:unknown):void {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${name} must be an object.`);
}

/** Validate once; disabling the parent does not inspect unused adaptive inputs. */
export function normalizeWavefrontRefinementPolicy(options:WavefrontRefinementOptions={}):WavefrontRefinementPolicy {
  plain('refinement',options);
  if(!bool('enabled',options.enabled))return defaults;
  const maximum=integer('maximumSamplesPerPixel',options.maximumSamplesPerPixel??defaults.maximumSamplesPerPixel,256);
  const moving=integer('movingMaximumSamplesPerPixel',options.movingMaximumSamplesPerPixel??Math.min(defaults.movingMaximumSamplesPerPixel,maximum),maximum);
  const work=integer('maximumWorkUnitsPerBatch',options.maximumWorkUnitsPerBatch??defaults.maximumWorkUnitsPerBatch,1_000_000);
  const f=options.foveation??{};plain('foveation',f);
  const uv=f.focusPointUv??defaults.foveation.focusPointUv;
  if(!Array.isArray(uv)||uv.length!==2||uv.some(v=>!Number.isFinite(v)))throw new RangeError('focusPointUv must contain two finite values.');
  const focus=Object.freeze(uv.map(v=>Math.max(0,Math.min(1,v)))) as readonly [number,number];
  const inner=finite('innerRadius',f.innerRadius??defaults.foveation.innerRadius);
  const outer=finite('outerRadius',f.outerRadius??defaults.foveation.outerRadius);
  const edge=finite('edgeImportance',f.edgeImportance??defaults.foveation.edgeImportance);
  if(outer<=inner||edge>1)throw new RangeError('Focus radii must increase and edge importance must be in 0..1.');
  return Object.freeze({enabled:true,maximumSamplesPerPixel:maximum,movingMaximumSamplesPerPixel:moving,
    sequencePeriodSamplesPerPixel:maximum,maximumWorkUnitsPerBatch:work,
    stationaryRefinement:bool('stationaryRefinement',options.stationaryRefinement),
    performanceBudget:bool('performanceBudget',options.performanceBudget),
    foveation:Object.freeze({enabled:bool('foveation.enabled',f.enabled),focusPointUv:focus,innerRadius:inner,outerRadius:outer,edgeImportance:edge})});
}

/** Plan predictable work before drawing samples; one unit is renderer-defined. */
export function planWavefrontRefinement(policy:WavefrontRefinementPolicy,input:WavefrontRefinementInput):WavefrontRefinementPlan|null {
  if(!policy.enabled)return null;
  if(typeof input.moving!=='boolean'||typeof input.previewComplete!=='boolean')throw new TypeError('Moving/preview state must be boolean.');
  const effective=integer('effectiveSamplesPerPixel',input.effectiveSamplesPerPixel??policy.movingMaximumSamplesPerPixel,256);
  const phase=!input.previewComplete?'coverage':!input.moving&&policy.stationaryRefinement?'stationary':'focus';
  const maximum=phase==='coverage'?1:phase==='stationary'?policy.maximumSamplesPerPixel:Math.min(effective,policy.movingMaximumSamplesPerPixel);
  let units=policy.maximumWorkUnitsPerBatch,reason:WavefrontRefinementPlan['budgetReason']='budget-disabled',estimate:number|null=null;
  if(policy.performanceBudget){
    const budget=finite('frameTimeBudgetMs',input.frameTimeBudgetMs??0);
    if(budget>0){
      const spent=finite('spentFrameTimeMs',input.spentFrameTimeMs??0),cost=input.estimatedWorkUnitMs;
      if(cost===undefined){units=1;reason='uncalibrated';}
      else {
        finite('estimatedWorkUnitMs',cost);
        if(cost===0)throw new RangeError('estimatedWorkUnitMs must be positive.');
        units=Math.min(units,Math.floor(Math.max(0,budget-spent)/cost));
        if(units===0&&phase!=='focus'){units=1;reason='minimum-work-unit-over-budget';}
        else reason=units===0?'no-optional-budget':'within-budget';
        estimate=units*cost;
      }
    }
  }
  const adaptive=normalizeWavefrontAdaptiveBudgetPolicy(maximum,{enabled:true,minimumSamplesPerPixel:1});
  return Object.freeze({phase,minimumCoverageRequired:phase==='coverage',minimumSamplesPerPixel:1,maximumSamplesPerPixel:maximum,
    sequencePeriodSamplesPerPixel:policy.sequencePeriodSamplesPerPixel,tiers:adaptive.tiers,
    focusImportanceActive:phase==='focus'&&policy.foveation.enabled,globalCatchUp:phase==='stationary',
    maximumWorkUnits:units,canRun:units>0,estimatedWorkMs:estimate,budgetReason:reason});
}

/** CPU focus reference for the renderer's independently tested GPU implementation. */
export function wavefrontRefinementImportance(policy:WavefrontRefinementPolicy,uv:readonly [number,number],aspect:number):number {
  if(!Array.isArray(uv)||uv.length!==2||uv.some(v=>!Number.isFinite(v)||v<0||v>1)||!Number.isFinite(aspect)||aspect<=0)throw new RangeError('Invalid viewport coordinates/aspect.');
  if(!policy.enabled||!policy.foveation.enabled)return 1;
  const f=policy.foveation,radius=Math.hypot((uv[0]-f.focusPointUv[0])*aspect,uv[1]-f.focusPointUv[1]);
  const t=Math.max(0,Math.min(1,(radius-f.innerRadius)/(f.outerRadius-f.innerRadius)));
  return f.edgeImportance+(1-f.edgeImportance)*(1-t*t*(3-2*t));
}
