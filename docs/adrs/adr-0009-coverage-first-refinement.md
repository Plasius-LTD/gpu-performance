# ADR 0009: Coverage-first refinement planning

Status: Accepted for experimental implementation; production qualification pending.

Feature [2367](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2367),
Story2368, package Task51. This extends ADR0008's pure policy contract, rather
than introducing another governor. Three.js remains permanently prohibited.

Cover every pixel once before optional work. During interaction, admit focused
extra work against the existing effective ceiling and explicit remaining budget.
While stationary, retain the configured full-screen total and admit bounded
catch-up work, including peripheral pixels. Sequence period remains independent
of batch size. The renderer owns counts, exact radiance sums and invalidation;
camera/shared owns timestamped interaction lifecycle. No variance stopping,
reprojection or radiance reuse across changed integrands is authorized here.

The policy is immutable and side-effect free. It reads caller-supplied completed
costs and negotiated budget; it retains no timer/EMA/controller. Unknown costs
admit one calibration unit. A mandatory coverage/stationary unit may exceed an
indivisible deadline and reports that reason. Zero/omitted budget disables
reduction. No scheduling contract alone establishes60Hz or memory savings.

Parent and stationary/performance/foveation controls are independent and default
off. Disabling parent returns null before reading frame inputs. Existing runtime
APIs remain unchanged. Native GPU/sample/HDR, memory, image and full-scene
performance qualification must precede release claims or production activation.
