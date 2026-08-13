/**
 * Centralized GSAP module — import gsap and ScrollTrigger from here.
 *
 * Registering plugins in every component causes the registration to run on
 * every module load. A single shared module guarantees it runs exactly once,
 * reducing parse / init overhead and keeping the bundle clean.
 *
 * Usage in any component:
 *   import gsap, { ScrollTrigger } from "@/lib/gsap";
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export { ScrollTrigger };
export default gsap;
