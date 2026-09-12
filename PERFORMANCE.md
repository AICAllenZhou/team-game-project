# Rendering performance

September 12 optimization:

- Batch fixed scenery and revolver parts by material. Hammer, cylinder and hand pivots remain separate.
- Draw sparks and smoke with two reusable instanced meshes, including individual color and opacity.
- Reuse the sun shadow map until a caster changes. Moving multiplayer characters and hit targets still update shadows.
- Move the accumulating shot vignette into the existing graphics pass; remove the animated CSS blur and blend layers.
- Sample muzzle bloom only near the muzzle. Keep the same shader active to avoid shader changes during firing.
- Avoid temporary arrays in mouse input and hand smoothing.
- Cap rendering to one pixel per CSS pixel and a 1080p pixel budget, retaining 2x MSAA. Higher-density displays trade some sharpness for lower GPU load.

## Comparison

Local Chrome, scripted turning, aiming and rapid firing, 2-second warmup followed by roughly 8 seconds of sampling. Both versions first used the same 2787 x 1322 render buffer:

| Measurement | Previous code | Optimized code |
| --- | ---: | ---: |
| Average draw calls per frame (including shadows) | 238.9 | 67.8 |
| Average main-thread frame work | 5.44 ms | 3.09 ms |

This is about 72% fewer draw calls and 43% less measured CPU frame work in that workload. Timing was variable across runs, and the comparison does not establish an FPS improvement or isolate GPU execution time. The final pixel-budget change is additional to these same-resolution measurements. Particle randomness and browser/system load can affect results.

Run `node tools/benchmark.mjs <baseline-git-ref>` and visit `http://localhost:3102/baseline` followed by `/optimized` in the same browser. The default baseline is `HEAD~1`. This local-only harness runs without mouse capture or audio and is excluded from the deployed build. It tests rendering work, not input latency, audio or multiplayer performance.

Validation: `node --test tests/*.test.mjs` (37 passing), `node build-static.mjs`, browser rendering/shader check, and HTTP checks for the new module. Batch tests cover transformed bounds, normals and independent animation pivots; particle tests cover capacity, fade, expiry and buffer reuse.
