import bmesh
import bpy
from bpy.types import Operator


class SmartUnwrapOperator(Operator):
  """Unwrap meshes with Blender's built-in Smart UV Project"""
  bl_idname = "unwrellaoperator.smart_unwrap"
  bl_label = "Smart UV Unwrap"
  bl_description = "Unwrap selected meshes or selected faces using Blender's Smart UV Project"
  bl_options = {"REGISTER", "UNDO"}

  @classmethod
  def poll(cls, context):
    return context.mode in {'OBJECT', 'EDIT_MESH'}

  def execute(self, context):
    object_mode = context.mode == 'OBJECT'
    if object_mode:
      meshes = [obj for obj in context.selected_editable_objects
                if obj.type == 'MESH' and obj.data.is_editable]
    else:
      meshes = list(context.objects_in_mode_unique_data)

    if not meshes or (object_mode and not any(obj.data.polygons for obj in meshes)):
      self.report({'WARNING'}, "Select a mesh with faces to unwrap")
      return {'CANCELLED'}

    previous_active = context.view_layer.objects.active
    selection = []
    entered_edit_mode = False
    try:
      if object_mode:
        # Preserve the mesh selection as it was before entering Edit Mode.
        seen = set()
        for obj in meshes:
          mesh = obj.data
          if mesh in seen:
            continue
          seen.add(mesh)
          selection.append((mesh, [v.select for v in mesh.vertices],
                            [e.select for e in mesh.edges], [f.select for f in mesh.polygons]))
        context.view_layer.objects.active = next(obj for obj in meshes if obj.data.polygons)
        bpy.ops.object.mode_set(mode='EDIT')
        entered_edit_mode = True
        bpy.ops.mesh.select_all(action='SELECT')

      if not any(face.select and not face.hide for obj in context.objects_in_mode_unique_data
                 for face in bmesh.from_edit_mesh(obj.data).faces):
        self.report({'WARNING'}, "Select at least one visible face to unwrap")
        return {'CANCELLED'}

      props = context.scene.UnwrellaProps
      result = bpy.ops.uv.smart_project(
        angle_limit=props.smart_angle_limit,
        margin_method=props.smart_margin_method,
        island_margin=props.smart_island_margin,
        rotate_method=props.smart_rotate_method,
        area_weight=props.smart_area_weight,
        correct_aspect=props.smart_correct_aspect,
        scale_to_bounds=props.smart_scale_to_bounds,
      )
      if 'FINISHED' not in result:
        self.report({'WARNING'}, "Smart UV unwrap could not be completed")
        return {'CANCELLED'}
      return {'FINISHED'}
    except RuntimeError as exc:
      self.report({'ERROR'}, "Smart UV unwrap failed: " + str(exc))
      return {'CANCELLED'}
    finally:
      if entered_edit_mode:
        bpy.ops.object.mode_set(mode='OBJECT')
        for mesh, verts, edges, faces in selection:
          for element, selected in zip(mesh.vertices, verts):
            element.select = selected
          for element, selected in zip(mesh.edges, edges):
            element.select = selected
          for element, selected in zip(mesh.polygons, faces):
            element.select = selected
      if object_mode:
        context.view_layer.objects.active = previous_active
