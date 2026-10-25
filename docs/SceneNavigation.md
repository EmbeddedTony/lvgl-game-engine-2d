# Scene view navigation

The 2D Scene view has independent editor navigation. Pan and zoom the artwork without changing object positions, the game's camera, the project file or Undo history.

| Control | Action |
| --- | --- |
| Hold right mouse + drag | Pan, including while painting or over an object/handle |
| Hold middle mouse + drag | Pan |
| Hold Space + left-drag | Pan |
| Scroll wheel up/down | Zoom in/out around the pointer |
| Zoom selector | Set a zoom around the view center |
| F / Frame Selected button | Frame the selected object and its branch |
| Home / Frame All button | Frame visible scene content, including negative and distant positions |
| Fit game display button | Center the game's display rectangle and fit it to the panel |

F and Home work while the Scene view has focus or the pointer is over it. Text fields, menus and dialogs keep their own keyboard input. While painting, F remains the Fill shortcut. The toolbar framing buttons are always available. Right mouse is reserved for panning; use **E** or the **Eraser** tool to erase tiles. **Alt + left-click** still picks a tile.

Manual zoom and pan survive panel/window resizing, ordinary authoring changes, recovery saves, Save As, scene switching and a Play/Stop cycle. Views are remembered for up to 64 scene/game contexts during the editor session. Opening or creating a document starts a fresh navigation session; its name and save path do not identify the view. Choosing Fit explicitly restores automatic display fitting; a later manual zoom/pan switches it off again. Switching between monitors or pixel-rendering policies re-aligns the view to the appropriate pixel grid without re-fitting the scene.

The display outline marks the game's output area. In Scene view, content can be inspected outside that outline; this makes large scrolling worlds and off-screen objects accessible. The existing 2D camera controls configure the actual game camera and offer a separate camera preview offset. Game preview still follows the authored camera and keeps its HUD pinned.

At inspection scales, **Pixels on** keeps whole physical-pixel enlargement and aligned placement. Smaller **overview** scales let you see a whole level; zoom back in to inspect source pixels accurately. Overview is editor magnification, not an asset reduction or an export setting.

The scene raster covers only the visible editor region. Its backing resolution shrinks at overview scales instead of allocating a bitmap for the entire world; sprite variant caches remain bounded. The non-pixel tile renderer uses the same visible window and sampling budget. No new MCU framebuffer or runtime navigation logic is exported.

## Implementation

`src/editor/viewport-navigation.ts` owns zoom steps, anchoring math and branch bounds. `useSceneNavigation` owns transient per-context views, pointer capture, wheel/key input and resize policy. Capture-phase navigation prevents a pan gesture from starting an object drag, collider resize or tile stroke. Wheel listeners explicitly disable browser scrolling. Cancellation, lost pointer capture and window blur end navigation safely.

The previous unconditional ResizeObserver called Fit after every size notification, including layout changes caused by zoom. Automatic fitting is now an explicit state and cannot overwrite manual navigation. `ScenePixels` renders a culled editor window beyond the display outline; Game/native rendering policies keep their own limits.

Interaction references: Unity documents [right/middle-drag 2D navigation](https://docs.unity.com/en-us/engine/6000.6/manual/unity-editor/editor-windows-views-reference/using-the-scene-view/scene-view-navigation). Godot documents [2D pan modifiers and zoom behavior](https://docs.godotengine.org/en/stable/classes/class_editorsettings.html#class-editorsettings-property-editors-panning-simple-panning) and provides its [editor zoom widget source](https://github.com/godotengine/godot/blob/master/editor/gui/editor_zoom_widget.cpp). This implementation uses the engine's own authoring and rendering architecture.
