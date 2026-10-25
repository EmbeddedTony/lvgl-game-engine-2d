# Pixel-perfect artwork

**Pixel Perfect is on by default**, including existing version 1 projects. The viewport's **Pixels on/off** button and **Project settings → Pixel perfect rendering** edit the same saved, undoable preference. Disabling it allows fractional Fit zoom; nearest-neighbor image sampling stays enabled.

## Design and test

1. Choose the project's game resolution, such as 320×240. This is the logical pixel grid used by game code and LVGL, independently of desktop window size.
2. Import artwork at its intended native resolution. Select a sprite, then use **Inspector → Sprite → Sprite pixel scale** for 1× native size or a uniform whole-number enlargement. Width and height change together, as one undo step. Custom sizes remain possible, with a warning when they shrink, stretch or unevenly enlarge source pixels. Custom colliders retain their authored dimensions.
3. **Fit game display** picks the largest whole-physical-pixel scale that fits when possible. Scene overview zoom can go smaller to frame a large world; zoom back in for exact pixel inspection. Game and Native LVGL retain their whole-pixel minimum. **Zoom** shows both the CSS percentage and the physical multiplier. On a Retina display, 100% normally represents two physical pixels per game pixel; 50% can represent one. Fractional OS scales are handled in physical pixels too.
4. Leave unused viewport space around the game instead of stretching its aspect ratio. Game/native views scroll when even one physical pixel per game pixel cannot fit. Scene view supports right/middle/Space panning and overview scales. Snap switches object dragging between 4px and 1px increments; numeric positions and game logic may still contain fractions.
5. Use **Native LVGL** to test the exported C. Its **Display zoom** offers integer fit and explicit 1×–8× physical-pixel views, with scrolling for large views. Display zoom does not change game coordinates, physics, export dimensions or touch targets.

The editor adjusts frame placement after panel/window resizing, scrolling and device-pixel-ratio changes. One culled scene canvas (game-resolution during Play) draws the visible scene in order, including sprites, tiles, shapes and preview text. The transparent scene nodes above it own selection, clicks and authoring handles. This keeps artwork on one grid instead of separately clipping/compositing each sprite at a fractional desktop position. Layout scaling avoids a second transformed image layer. The frame starts on a boundary shared by CSS and physical pixels; at 125% OS scale, that is a multiple of four CSS pixels. Screenshot tests check actual rendered colors and tile seams at 1×, 1.25× and 2× device scales.

## Movement and hierarchy

Only drawing snaps. For example, a parent at 12.25 and child at 3.25 draw at world pixel 16, while their simulation position remains 15.5. The renderer composes parents first and rounds the final world position once. It uses C `roundf` semantics, including negative halves rounding away from zero. Sprites, tilemap clipping, painting coordinates, grid origins and collision outlines use the same draw convention.

Physics retains subpixel precision, velocities and fixed 60Hz integration. Do not round movement each update: a slow character could stop moving entirely. Pixel snapping naturally produces stepped visual motion at low speeds. The physics shape can lie less than a pixel from the rounded artwork; that is intentional. Native LVGL remains the authoritative check for custom C and LVGL widgets.

## Export and MCU cost

The exported `ui/generated/game_data.h` includes `GAME_PIXEL_PERFECT` (1 or 0), alongside `GAME_WIDTH` and `GAME_HEIGHT`. It records the authoring policy; it does not instruct a board driver to change resolution or allocate a render target. The exported guide explains the drawing contract.

Export bakes sprite sizes using nearest sampling, then packs I4/I8 palettes or ARGB8888 according to actual payload size. Uniform 2× enlargement repeats each source pixel into a 2×2 block. Identical image/size payloads still share descriptors and flash storage. Each larger variant has a flash cost, so 1× art is cheapest. Prebaking avoids runtime transforms, temporary transformed images, and color-rounding differences observed when scaling palette artwork in LVGL. Maps retain their existing compression, viewport culling and one-object-per-layer rendering. The editor clips oversized sprite bitmaps to the game view and bounds decoded variant caches to 4 MiB; its game-preview RGBA canvas costs width × height × 4 desktop bytes; Scene view uses a visible-window canvas and reduces its backing size at overview scales and is not exported as an MCU framebuffer.

LVGL draws into the game's exact authored dimensions at 1:1. Keep its root and ancestors at integer positions. On a larger panel, center the unchanged game area, or implement whole-number nearest enlargement in the board port and invert that mapping for touch input. There is no hidden full-frame offscreen buffer or automatic fractional panel stretch. Check draw buffers, image decoder caches, flash access and frame time on hardware.

RGB565 still quantizes colors to the configured 16-bit format. Antialiased fonts, partially transparent artwork, arbitrary rotations and non-integer sprite resizing are separate from uniform opaque pixel blocks. Existing LVGL text uses its configured font; this feature does not add a pixel font importer, camera or rotation system.

The H7 village's original two-color grass and road are procedural placeholder textures. They were not imported from the detailed Country Woods sheets. The local original-resolution Country Woods variant checks the PNG crop against the imported grass and ARGB8888 export with zero changed channels. Its 74-color grass also passes an exact per-pixel RGB565 check in real LVGL. The aligned NeoChrom image payload remains 1,468,416 bytes because texture dimensions are unchanged. The LVGL tile renderer sets `antialias=false`; the pinned NemaGFX backend maps that to point sampling. This preserves texture detail already present in the source; it cannot reconstruct samples discarded by a smaller output size.

The resolution policy follows the whole-number scaling principle described in [Godot's multiple-resolution guide](https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html). LVGL image sampling is documented in its [image widget guide](https://lvgl.io/docs/open/9.4/details/widgets/image.html). Implementation is specific to this editor and its portable runtime.

See [Scene navigation](SceneNavigation.md) for wheel zoom, framing, pointer anchoring and the explicit automatic-fit policy.
