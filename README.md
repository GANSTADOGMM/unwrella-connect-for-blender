# UnwrellaConnect Extension for Blender

**UnwrellaConnect for Blender** is a free extension that enables the use of Unwrella-IO or Packer-IO directly from within Blender.

All functionality is directly available from within Blender's UV editor and all interaction between the programs happens transparently in the background. Unwrap anything without any manual exporting and re-importing of objects.

![UnwrellaConnect for Blender screenshot](https://docs.3d-plugin.com/images/unwrella-blender-bridge/unwrella-blender-UnwrellaConnect-title.png "UnwrellaConnect for Blender screenshot")

## Requirements
The extension requires Blender version 4.2 or later.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:bc3a8deb1de6fceb97e2ec63d9f7a8cf619610ac8289f5d52d4a8f08c25363c7 -->

The built-in Smart UV Unwrap works without external software. The extension also connects to Unwrella-IO or Packer-IO for their external unwrap and packing features; those features require one of the following programs:

<!-- /coderabbit-ai-generated:v1 -->

### Packer-IO
Packer-IO is freely available for Windows and Mac. It can be used with UnwrellaConnect to provide the full packing (but not the unwrapping) functionality of Unwrella completely free of charge.
UnwrellaConnect for Blender can interact with Packer-IO 1.2.0 or later.
For more information and free download of Packer-IO check out the [Packer-IO homepage](https://www.uv-packer.com)

### Unwrella-IO
Unwrella-IO is commercially available for Windows and can be used with UnwrellaConnect to provide full featured unwrapping and packing functionality.
UnwrellaConnect for Blender can interact with Unwrella-IO 1.1.0 or later.
For more information about Unwrella-IO check out the [Unwrella-IO homepage](https://www.unwrella.com)

## Installation
To install the extension in Blender just drag and drop the downloaded archive file into the Blender viewport.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e904c9eb4de5641d72231cba2c2dc86f96a12ab4bd73f2f2bd4e4d0acea217b2 -->

## Smart UV Unwrap

In the UV Editor, open the Unwrella sidebar and choose **Smart UV Unwrap**. This uses Blender's Smart UV Project and packs the result into the UV tile. In Object Mode it processes all visible faces of the selected mesh objects together; in Edit Mode it processes selected visible faces. It writes to each mesh's active UV map, creating one if needed. Other faces retain their UVs; packing selected faces does not account for unselected UV islands.

Adjust the angle limit, island margin and its measurement method, island rotation, area weight, aspect correction, and scaling to bounds in the panel. The operation supports Blender undo and does not use the external Unwrella or Packer settings.

<!-- /coderabbit-ai-generated:v1 -->

## Documentation
You can find the full documentation for UnwrellaConnect here:
https://docs.3d-plugin.com/unwrellaconnect-blender

## See it in Action
[![UnwrellaConnect video](https://img.youtube.com/vi/BiFyYPNrmDc/maxresdefault.jpg)](https://www.youtube.com/watch?v=BiFyYPNrmDc)
