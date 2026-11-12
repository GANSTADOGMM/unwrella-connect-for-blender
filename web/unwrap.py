"""Run one OBJ Smart UV Project in an isolated temporary working directory."""
import json
import math
import sys
from pathlib import Path

import bpy

work = Path(sys.argv[1])
settings = json.loads((work / 'settings.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=str(work / 'input.obj'))
meshes = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH' and len(obj.data.polygons)]
if not meshes:
  raise ValueError('The OBJ does not contain any faces.')
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
result = bpy.ops.uv.smart_project(
  angle_limit=math.radians(settings['angle']),
  island_margin=settings['margin'],
  margin_method='FRACTION',
  area_weight=settings['areaWeight'],
  correct_aspect=True,
  scale_to_bounds=False,
)
if 'FINISHED' not in result:
  raise ValueError('Smart UV Project could not unwrap this mesh.')
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.wm.obj_export(filepath=str(work / 'output.obj'), export_selected_objects=True,
                      export_materials=False, export_uv=True, export_normals=True)
