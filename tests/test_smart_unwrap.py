"""Run with Blender's Python: python tests/test_smart_unwrap.py."""
import importlib.util
import pathlib
import sys

import bpy
import bmesh

root = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
  'unwrella_test', root / '__init__.py', submodule_search_locations=[str(root)])
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
addon.register()


def clear_scene():
  if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete(use_global=False)


def cube(name):
  bpy.ops.mesh.primitive_cube_add()
  obj = bpy.context.object
  obj.name = name
  if obj.data.uv_layers:
    obj.data.uv_layers.remove(obj.data.uv_layers.active)
  return obj


def uvs(mesh):
  return [tuple(loop.uv) for loop in mesh.uv_layers.active.data]


def test_object_mode():
  clear_scene()
  first = cube('First')
  # Selection state in object mode is retained after the operation.
  for polygon in first.data.polygons:
    polygon.select = False
  second = cube('Second')
  bpy.ops.object.select_all(action='DESELECT')
  first.select_set(True)
  second.select_set(True)
  bpy.ops.object.empty_add()
  empty = bpy.context.object
  vertices = bpy.data.meshes.new('Vertices Only')
  vertices.from_pydata([(0, 0, 0)], [], [])
  vertices.vertices[0].select = False
  vertex_object = bpy.data.objects.new('Vertices Only', vertices)
  bpy.context.collection.objects.link(vertex_object)
  vertex_object.select_set(True)
  first.select_set(True)
  second.select_set(True)
  assert bpy.ops.unwrellaoperator.smart_unwrap() == {'FINISHED'}
  assert bpy.context.mode == 'OBJECT' and bpy.context.object == empty
  assert set(bpy.context.selected_objects) == {first, second, empty, vertex_object}
  assert not vertices.vertices[0].select
  assert not any(poly.select for poly in first.data.polygons)
  for obj in (first, second):
    assert obj.data.uv_layers.active is not None
    coords = uvs(obj.data)
    assert len(set(coords)) > 2 and all(-0.0001 <= c <= 1.0001 for uv in coords for c in uv)


def test_edit_selection():
  clear_scene()
  obj = cube('Edit')
  bpy.ops.object.mode_set(mode='EDIT')
  bpy.ops.mesh.select_all(action='DESELECT')
  bm = bmesh.from_edit_mesh(obj.data)
  bm.faces.ensure_lookup_table()
  bm.faces[0].select_set(True)
  uv_layer = bm.loops.layers.uv.verify()
  for face in bm.faces:
    for loop in face.loops:
      loop[uv_layer].uv = (0.25, 0.25)
  bmesh.update_edit_mesh(obj.data)
  assert bpy.ops.unwrellaoperator.smart_unwrap() == {'FINISHED'}
  assert bpy.context.mode == 'EDIT_MESH'
  assert [face.select for face in bm.faces] == [True] + [False] * 5
  assert len({tuple(loop[uv_layer].uv) for loop in bm.faces[0].loops}) > 1
  assert all(tuple(loop[uv_layer].uv) == (0.25, 0.25)
             for face in list(bm.faces)[1:] for loop in face.loops)
  bpy.ops.mesh.select_all(action='DESELECT')
  assert bpy.ops.unwrellaoperator.smart_unwrap() == {'CANCELLED'}


def test_shared_mesh_and_settings():
  clear_scene()
  first = cube('Shared')
  first.data.uv_layers.new(name='Keep')
  first.data.uv_layers.new(name='Target')
  first.data.uv_layers.active = first.data.uv_layers['Target']
  keep_before = [tuple(loop.uv) for loop in first.data.uv_layers['Keep'].data]
  duplicate = first.copy()
  duplicate.data = first.data
  bpy.context.collection.objects.link(duplicate)
  duplicate.select_set(True)
  props = bpy.context.scene.UnwrellaProps
  props.smart_angle_limit = 0.8
  props.smart_margin_method = 'ADD'
  props.smart_island_margin = 0.05
  props.smart_rotate_method = 'AXIS_ALIGNED_X'
  props.smart_area_weight = 0.5
  props.smart_correct_aspect = False
  props.smart_scale_to_bounds = True
  assert bpy.ops.unwrellaoperator.smart_unwrap() == {'FINISHED'}
  assert first.data == duplicate.data and first.data.uv_layers.active.name == 'Target'
  assert [tuple(loop.uv) for loop in first.data.uv_layers['Keep'].data] == keep_before
  assert len(set(uvs(first.data))) > 2


def test_multi_edit():
  clear_scene()
  first = cube('First Edit')
  second = cube('Second Edit')
  first.select_set(True)
  bpy.ops.object.mode_set(mode='EDIT')
  assert len(bpy.context.objects_in_mode_unique_data) == 2
  assert bpy.ops.unwrellaoperator.smart_unwrap() == {'FINISHED'}
  for obj in (first, second):
    bm = bmesh.from_edit_mesh(obj.data)
    layer = bm.loops.layers.uv.active
    assert layer is not None
    assert len({tuple(loop[layer].uv) for face in bm.faces for loop in face.loops}) > 2


def test_empty_selection():
  clear_scene()
  assert bpy.ops.unwrellaoperator.smart_unwrap() == {'CANCELLED'}


try:
  test_object_mode()
  test_edit_selection()
  test_shared_mesh_and_settings()
  test_multi_edit()
  test_empty_selection()
  print('Smart unwrap integration tests passed')
finally:
  clear_scene()
  addon.unregister()
