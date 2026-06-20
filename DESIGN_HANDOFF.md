# wmux Visual Handoff

## Source

Generated with the built-in imagegen path from a current wmux screenshot reference.

Prompt intent: a high-performance developer cockpit following the spirit of cmux plus Lamborghini design language, while explicitly avoiding any visual treatment to the terminal content area.

## Direction

- Dense cmux-like workspace navigation remains the functional spine.
- Lamborghini-inspired cues are applied only to application chrome:
  - true black and near-black surfaces,
  - satin gold focus and selected-state accents,
  - graphite dividers,
  - sharp clipped corners,
  - compact uppercase labels,
  - small green/red status indicators.
- The UI should feel technical, premium, sparse, and purposeful.

## Hard Constraint

Do not style the terminal viewport beyond the terminal emulator's own flat theme.

No gradients, textures, glows, decorative borders, shadows, blur, image backgrounds, transparency, or overlays inside the terminal canvas/viewport. The terminal remains a plain near-black rectangle with monospaced terminal text.

## Implementation Notes

- Sidebar gets a clearer hierarchy:
  - brand row,
  - active target host capsule,
  - workspace section,
  - host status section.
- Only one host selector remains. It controls new workspaces, new tabs, and split targets.
- Workspace rows and tab pills keep real links for direct workspace/tab navigation.
- Tabs and controls use angular clipped geometry with thin borders.
- Pane toolbar is chrome; terminal host below it stays plain.
- Media shelf belongs outside the terminal viewport and should sit below the terminal area when media is present.

## Out Of Scope

- Terminal color scheme redesign.
- Terminal background effects.
- Kitty/Sixel/iTerm inline graphics protocol rendering.
- Branding with Lamborghini logos, car silhouettes, or trademark-like marks.
